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
        isDragActive ? "border-fuchsia-300/30 bg-fuchsia-500/10" : "border-fuchsia-400/10 bg-[#240d1f]"
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
          <p className="text-sm font-semibold text-fuchsia-200">PDF upload</p>
          <p className="mt-1 text-sm leading-6 text-fuchsia-100/60">
            Drag and drop a PDF here, or click to select a file. The extracted text will populate the input automatically.
          </p>
          {fileName ? <p className="mt-2 text-xs text-fuchsia-100">Loaded: {fileName}</p> : null}
        </div>
        {isProcessing ? <div className="text-sm text-fuchsia-100/60">Processing PDF...</div> : null}
      </div>
    </div>
  );
}
