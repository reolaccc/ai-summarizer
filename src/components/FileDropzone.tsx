import { useRef, useState } from "react";

type Props = {
  onPdfFileSelected: (file: File) => Promise<void>;
  isProcessing: boolean;
  fileName: string | null;
};

export function FileDropzone({ onPdfFileSelected, isProcessing, fileName }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`rounded-3xl border border-dashed p-4 transition focus:outline-none ${
        isDragActive ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"
      }`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setIsDragActive(false);

        const file = event.dataTransfer.files[0];
        if (file) {
          await onPdfFileSelected(file);
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) {
            await onPdfFileSelected(file);
          }
          event.target.value = "";
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">PDF upload</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Drag and drop a PDF here, or click to select a file. The extracted text will populate the input automatically.
          </p>
          {fileName ? <p className="mt-2 text-xs text-sky-700">Loaded: {fileName}</p> : null}
        </div>
        <div className="text-sm text-slate-500">
          {isProcessing ? "Processing PDF..." : "PDF ready"}
        </div>
      </div>
    </div>
  );
}
