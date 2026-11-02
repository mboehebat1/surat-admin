"use client";

import { Download, Printer } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { formatDateID, formatBytes } from "@/lib/status";

export type PreviewInput = {
  kopText?: string | null;
  number?: string | null;
  date?: string | null;
  title?: string | null;
  recipientName?: string | null;
  recipientPosition?: string | null;
  recipientAddress?: string | null;
  bodyText?: string | null;
  signerName?: string | null;
  signerPosition?: string | null;
  classification?: string | null;
  attachments?: { originalName: string; sizeBytes?: number }[];
  letterId?: number | null;
  ready?: boolean;
};

export function LetterPreview({ data, className, showActions = true }: { data: PreviewInput; className?: string; showActions?: boolean }) {
  const kopLines = (data.kopText || "PEMERINTAH / ORGANISASI\nUNIT KERJA\nAlamat instansi").split("\n").filter(Boolean);

  return (
    <div className={cn("space-y-3", className)}>
      {showActions ? (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] text-slate-500">
            Pratinjau dokumen. Nomor surat diisi otomatis setelah persetujuan akhir.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
              Cetak
            </Button>
            {data.letterId ? (
              <>
                <a href={`/api/letters/${data.letterId}/download?format=pdf&inline=1`} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
                    PDF
                  </Button>
                </a>
                <a href={`/api/letters/${data.letterId}/download?format=docx`}>
                  <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
                    DOCX
                  </Button>
                </a>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="print-area mx-auto w-full max-w-[794px] rounded-lg border border-slate-300 bg-white p-8 shadow-sm sm:p-12">
        <div className="letter-paper">
          <header className="border-b-2 border-slate-900 pb-3 text-center">
            {kopLines.map((line, index) => (
              <p
                key={line}
                className={cn(
                  "leading-snug",
                  index === 0 ? "text-[15px] font-bold tracking-wide" : index === 1 ? "text-[13px] font-semibold" : "text-[10px]",
                )}
              >
                {line.toUpperCase()}
              </p>
            ))}
          </header>

          <div className="mt-5 flex items-start justify-between gap-6 text-[12px]">
            <div className="space-y-0.5">
              <p>
                <span className="inline-block w-20">Nomor</span>: {data.number || <span className="italic text-slate-400">(menunggu nomor)</span>}
              </p>
              <p>
                <span className="inline-block w-20">Lampiran</span>: {data.attachments?.length ? `${data.attachments.length} berkas` : "-"}
              </p>
              <p>
                <span className="inline-block w-20">Perihal</span>: <span className="font-semibold">{data.title || "-"}</span>
              </p>
              <p>
                <span className="inline-block w-20">Klasifikasi</span>: {(data.classification || "biasa").toUpperCase()}
              </p>
            </div>
            <p className="whitespace-nowrap">{formatDateID(data.date)}</p>
          </div>

          {data.recipientName ? (
            <div className="mt-5 text-[12px]">
              <p>Kepada Yth.</p>
              <p className="font-semibold">{data.recipientName}</p>
              {data.recipientPosition ? <p>{data.recipientPosition}</p> : null}
              {data.recipientAddress ? <p>{data.recipientAddress}</p> : null}
            </div>
          ) : null}

          <div className="mt-5 whitespace-pre-wrap text-justify text-[12.5px] leading-relaxed">
            <p>Dengan hormat,</p>
            {data.bodyText ? (
              data.bodyText.split("\n").map((paragraph, index) => (
                <p key={index} className="mt-2 indent-6">
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="mt-2 italic text-slate-400">Isi surat akan tampil di sini setelah formulir diisi.</p>
            )}
          </div>

          {data.attachments?.length ? (
            <div className="mt-4 text-[11px]">
              <p className="font-semibold">Dokumen pendukung:</p>
              <ul className="mt-1 list-inside list-decimal space-y-0.5">
                {data.attachments.map((attachment) => (
                  <li key={attachment.originalName}>
                    {attachment.originalName}
                    {attachment.sizeBytes ? ` (${formatBytes(attachment.sizeBytes)})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-10 flex justify-end">
            <div className="text-center text-[12px]">
              <p>Hormat kami,</p>
              <p>{data.signerPosition || "-"}</p>
              <p className="mt-12 font-semibold underline">{data.signerName || "-"}</p>
            </div>
          </div>

          <p className="mt-8 border-t border-dashed border-slate-300 pt-2 text-center text-[9px] italic text-slate-400">
            Dokumen ini disetujui secara elektronik melalui sistem E-SURAT dan sah tanpa tanda tangan basah.
            {data.ready === false ? " (pratinjau — belum memperoleh persetujuan)" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
