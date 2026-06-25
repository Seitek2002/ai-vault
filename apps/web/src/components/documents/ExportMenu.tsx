'use client';

import { useState, useRef, useEffect } from 'react';
import { exportPdf, exportDocx, openOriginalFile } from '@/lib/api/export';

interface ExportMenuProps {
  documentId: string;
  documentTitle: string;
  hasOriginalFile?: boolean;
}

export function ExportMenu({ documentId, documentTitle, hasOriginalFile }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'pdf' | 'docx' | 'original' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handle(type: 'pdf' | 'docx' | 'original') {
    setLoading(type);
    setOpen(false);
    try {
      if (type === 'pdf') await exportPdf(documentId, documentTitle);
      else if (type === 'docx') await exportDocx(documentId, documentTitle);
      else await openOriginalFile(documentId);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        Экспорт
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-lg z-50 py-1 overflow-hidden">
          <button
            onClick={() => void handle('pdf')}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <span className="text-[var(--color-text-tertiary)]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </span>
            Скачать PDF
          </button>

          <button
            onClick={() => void handle('docx')}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <span className="text-[var(--color-text-tertiary)]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            Скачать DOCX
          </button>

          {hasOriginalFile && (
            <>
              <div className="my-1 border-t border-[var(--color-border)]" />
              <button
                onClick={() => void handle('original')}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
              >
                <span className="text-[var(--color-text-tertiary)]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z" />
                  </svg>
                </span>
                Оригинальный файл
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
