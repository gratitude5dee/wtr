"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { applyManifestEntryAction } from "@/app/(dashboard)/assets/bulk-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { withBasePath } from "@/lib/base-path";
import { uploadEncrypted } from "@/lib/upload/encrypted-uploader";
import {
  parseManifest,
  SAMPLE_MANIFEST,
  type ManifestEntry,
} from "@/lib/upload/manifest";
import { measureFile, submitMeasurements } from "@/lib/upload/measure";
import { ACCEPT_ATTRIBUTE, modalityForFilename } from "@/lib/upload/modality";
import { makeImagePreview, uploadPreview } from "@/lib/upload/preview";
import type { HashResponse } from "@/lib/upload/hash-worker";

type ItemStatus =
  | "hashing"
  | "registering"
  | "encrypting"
  | "applying"
  | "registered"
  | "duplicate"
  | "flagged"
  | "error";

interface QueueItem {
  id: string;
  filename: string;
  byteSize: number;
  status: ItemStatus;
  progressBytes: number;
  assetId?: string;
  manifestApplied?: boolean;
  error?: string;
}

const STATUS_TEXT: Record<ItemStatus, string> = {
  hashing: "Hashing in your browser…",
  registering: "Registering…",
  encrypting: "Encrypting & uploading…",
  applying: "Applying manifest metadata…",
  registered: "In your tray",
  duplicate: "Already in your tray",
  flagged: "Needs review — same bytes claimed by another creator",
  error: "Failed",
};

/**
 * Manager-scale upload: many files at once, with per-file metadata supplied by
 * a CSV or JSON manifest keyed on filename. Registration reuses the same
 * `/api/assets` path as the single-file queue; the manifest only drives the
 * label/listing choices applied right after each file registers.
 */
export function BulkUpload() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [manifest, setManifest] = useState<Record<string, ManifestEntry>>({});
  const [manifestName, setManifestName] = useState<string | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const manifestRef = useRef<Record<string, ManifestEntry>>({});

  useEffect(() => {
    const worker = new Worker(new URL("../../lib/upload/hash-worker.ts", import.meta.url));
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  const patch = useCallback((id: string, changes: Partial<QueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }, []);

  const loadManifest = useCallback(async (file: File) => {
    try {
      const entries = parseManifest(file.name, await file.text());
      setManifest(entries);
      setManifestName(file.name);
      setManifestError(null);
    } catch (error) {
      setManifest({});
      setManifestName(null);
      setManifestError(error instanceof Error ? error.message : "could not read the manifest");
    }
  }, []);

  const register = useCallback(
    async (id: string, file: File, contentSha256: string) => {
      patch(id, { status: "registering" });
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
          const assetId = payload.assetId;
          patch(id, { status: "encrypting", assetId, progressBytes: 0 });
          const modality = modalityForFilename(file.name);
          if (modality) {
            void measureFile(file, modality).then((measured) =>
              measured ? submitMeasurements(assetId, measured) : undefined,
            );
          }
          try {
            await uploadEncrypted(assetId, file, (sent, total) => {
              patch(id, { progressBytes: Math.round((sent / total) * file.size) });
            });
            const preview = await makeImagePreview(file).catch(() => null);
            if (preview) await uploadPreview(assetId, preview).catch(() => undefined);
          } catch (error) {
            patch(id, {
              status: "error",
              error: error instanceof Error ? error.message : "upload failed",
            });
            return;
          }

          const entry = manifestRef.current[file.name];
          if (entry) {
            patch(id, { status: "applying" });
            const result = await applyManifestEntryAction(assetId, entry);
            if (result.error) {
              patch(id, { status: finalStatus, error: result.error });
              return;
            }
            patch(id, { manifestApplied: true });
          }
        }
        patch(id, { status: finalStatus, assetId: payload.assetId });
      } catch (error) {
        patch(id, {
          status: "error",
          error: error instanceof Error ? error.message : "network",
        });
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
              progressBytes: 0,
              error: "unsupported file type",
            },
          ]);
          continue;
        }
        setItems((current) => [
          ...current,
          { id, filename: file.name, byteSize: file.size, status: "hashing", progressBytes: 0 },
        ]);
        const onMessage = (event: MessageEvent<HashResponse>) => {
          const message = event.data;
          if (message.id !== id) return;
          if (message.kind === "progress") {
            patch(id, { progressBytes: message.hashedBytes });
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

  const manifestCount = Object.keys(manifest).length;
  const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_MANIFEST)}`;

  return (
    <div className="space-y-4" data-tour="bulk-upload">
      <Card>
        <CardContent className="space-y-3 pt-5 text-sm">
          <div className="font-medium">Manifest (optional)</div>
          <p className="text-muted-foreground">
            A CSV or JSON file keyed on filename, carrying labels, license preset, price
            and modality for each upload. Values are applied as each file registers.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadManifest(file);
                event.target.value = "";
              }}
            />
            <Button asChild size="sm" variant="secondary">
              <a href={sampleHref} download="wtr-manifest-template.csv">
                Download template
              </a>
            </Button>
          </div>
          {manifestName && (
            <p className="text-muted-foreground">
              {manifestName} — {manifestCount} file{manifestCount === 1 ? "" : "s"} described.
            </p>
          )}
          {manifestError && <p className="text-destructive">{manifestError}</p>}
        </CardContent>
      </Card>

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
        <p className="font-medium">Drop a whole roster&apos;s worth of files here</p>
        <p className="mt-1 text-muted-foreground">
          Every file is fingerprinted and encrypted in your browser before anything leaves
          this device.
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
                  <div className="flex shrink-0 items-center gap-2">
                    {item.manifestApplied && (
                      <Badge variant="outline" className="text-[10px]">
                        manifest applied
                      </Badge>
                    )}
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
                </div>
                {(item.status === "hashing" || item.status === "encrypting") &&
                  item.byteSize > 0 && (
                    <Progress value={(item.progressBytes / item.byteSize) * 100} />
                  )}
                {item.error && (
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
