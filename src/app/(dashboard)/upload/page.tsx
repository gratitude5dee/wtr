export const dynamic = "force-dynamic";

export default function UploadPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Upload</h1>
      <p className="text-sm text-muted-foreground">
        The drop zone lands with the next slice (P0-2): files are hashed in your browser
        with SHA-256 before a single byte leaves your device.
      </p>
    </div>
  );
}
