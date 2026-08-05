"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { uploadEncrypted } from "@/lib/upload/encrypted-uploader";
import { withBasePath } from "@/lib/base-path";
import { measureFile, submitMeasurements } from "@/lib/upload/measure";
import { ACCEPT_ATTRIBUTE, modalityForFilename } from "@/lib/upload/modality";
import { makeImagePreview, uploadPreview } from "@/lib/upload/preview";
import type { HashResponse } from "@/lib/upload/hash-worker";

type ItemStatus =
  | "hashing"
  | "registering"
  | "encrypting"
  | "registered"
  | "duplicate"
  | "flagged"
  | "error";

interface QueueItem {
  id: string;
  filename: string;
  byteSize: number;
  status: ItemStatus;
  hashedBytes: number;
  contentSha256?: string;
  assetId?: string;
  error?: string;
}

const STORAGE_KEY = "wtr-upload-queue-v1";

/**
 * Persist finished/failed entries so the queue survives a tab close
 * (goal.md P0-2). In-flight items are dropped on restore: re-adding the same
 * file is safe because the same bytes resolve to the same asset.
 */
function restoreQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem[];
    return parsed.filter(
      (item) =>
        item.status !== "hashing" &&
        item.status !== "registering" &&
        item.status !== "encrypting",
    );
  } catch {
    return [];
  }
}

const STATUS_TEXT: Record<ItemStatus, string> = {
  hashing: "Hashing in your browser…",
  registering: "Registering…",
  encrypting: "Encrypting & uploading — the key stays on this device…",
  registered: "In your tray",
  duplicate: "Already in your tray",
  flagged: "Needs review — same bytes claimed by another creator",
  error: "Failed",
};

export function UploadQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setItems(restoreQueue());
    const worker = new Worker(new URL("../../lib/upload/hash-worker.ts", import.meta.url));
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (items.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const patch = useCallback((id: string, changes: Partial<QueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }, []);

  const register = useCallback(
    async (id: string, file: File, contentSha256: string) => {
      patch(id, { status: "registering", contentSha256 });
      try {
        const response = await fetch(withBasePath("/api/assets"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            byteSize: file.size,
            mimeType: file.type || "application/octet-stream",
            contentSha256,
          }),
        });
        const payload = (await response.json()) as {
          assetId?: string;
          existing?: boolean;
          duplicateClaimFlag?: boolean;
          error?: string;
        };
        if (!response.ok) {
          patch(id, { status: "error", error: payload.error ?? `HTTP ${response.status}` });
          return;
        }
        const finalStatus: ItemStatus = payload.duplicateClaimFlag
          ? "flagged"
          : payload.existing
            ? "duplicate"
            : "registered";
        if (payload.assetId && finalStatus !== "flagged") {
          patch(id, { status: "encrypting", assetId: payload.assetId, hashedBytes: 0 });
          const assetId = payload.assetId;
          // Tier-1 measurement (duration/dimensions) happens on-device — only
          // the numbers leave the browser. Best-effort, never blocks upload.
          const modality = modalityForFilename(file.name);
          if (modality) {
            void measureFile(file, modality).then((measured) =>
              measured ? submitMeasurements(assetId, measured) : undefined,
            );
          }
          try {
            await uploadEncrypted(assetId, file, (sent, total) => {
              patch(id, {
                hashedBytes: Math.round((sent / total) * file.size),
              });
            });
            // A preview is nice-to-have: its failure must not mark a fully
            // uploaded file as failed.
            const preview = await makeImagePreview(file).catch(() => null);
            if (preview) await uploadPreview(assetId, preview).catch(() => undefined);
          } catch (error) {
            patch(id, {
              status: "error",
              error: error instanceof Error ? error.message : "upload failed",
            });
            return;
          }
        }
        patch(id, { status: finalStatus, assetId: payload.assetId });
      } catch (error) {
        patch(id, { status: "error", error: error instanceof Error ? error.message : "network" });
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const worker = workerRef.current;
      if (!worker) return;
      for (const file of Array.from(files)) {
        const id = crypto.randomUUID();
        if (!modalityForFilename(file.name)) {
          setItems((current) => [
            ...current,
            {
              id,
              filename: file.name,
              byteSize: file.size,
              status: "error",
              hashedBytes: 0,
              error: "unsupported file type",
            },
          ]);
          continue;
        }
        setItems((current) => [
          ...current,
          { id, filename: file.name, byteSize: file.size, status: "hashing", hashedBytes: 0 },
        ]);
        const onMessage = (event: MessageEvent<HashResponse>) => {
          const message = event.data;
          if (message.id !== id) return;
          if (message.kind === "progress") {
            patch(id, { hashedBytes: message.hashedBytes });
          } else if (message.kind === "done") {
            worker.removeEventListener("message", onMessage);
            void register(id, file, message.contentSha256);
          } else {
            worker.removeEventListener("message", onMessage);
            patch(id, { status: "error", error: message.message });
          }
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ id, file });
      }
    },
    [patch, register],
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        className={`w-full rounded-lg border-2 border-dashed p-12 text-center text-sm transition-colors ${
          dragOver ? "border-foreground bg-muted" : "border-muted-foreground/30"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <p className="font-medium">Drop files here, or click to browse</p>
        <p className="mt-1 text-muted-foreground">
          Audio, video, image, 3D and motion. Files are fingerprinted in your browser —
          no bytes leave your device at this step.
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {items.length > 0 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {items.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="truncate font-medium">{item.filename}</span>
                  <Badge
                    variant={
                      item.status === "error"
                        ? "destructive"
                        : item.status === "flagged"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {STATUS_TEXT[item.status]}
                  </Badge>
                </div>
                {(item.status === "hashing" || item.status === "encrypting") &&
                  item.byteSize > 0 && (
                    <Progress value={(item.hashedBytes / item.byteSize) * 100} />
                  )}
                {item.error && item.status === "error" && (
                  <p className="text-xs text-destructive">{item.error}</p>
                )}
                {item.assetId && item.status !== "error" && (
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                    <Link href={`/assets/${item.assetId}`}>View asset</Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
