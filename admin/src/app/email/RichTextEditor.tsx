"use client";

import { useCallback, useRef } from "react";

type IconProps = { className?: string };

function IconBold({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

function IconItalic({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="11" y1="5" x2="18" y2="5" />
      <line x1="6" y1="19" x2="13" y2="19" />
      <line x1="14" y1="5" x2="10" y2="19" />
    </svg>
  );
}

function IconUnderline({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4v7a6 6 0 0 0 12 0V4" />
      <line x1="5" y1="20" x2="19" y2="20" />
    </svg>
  );
}

function IconHeading({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 5v14M16 5v14M6 12h10" />
    </svg>
  );
}

function IconBulletList({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="1" fill="currentColor" stroke="none" />
      <line x1="9.5" y1="6.5" x2="20" y2="6.5" />
      <line x1="9.5" y1="12" x2="20" y2="12" />
      <line x1="9.5" y1="17.5" x2="20" y2="17.5" />
    </svg>
  );
}

function IconNumberedList({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <text x="2.5" y="9" fontSize="7" fill="currentColor" stroke="none">1</text>
      <text x="2.5" y="15.5" fontSize="7" fill="currentColor" stroke="none">2</text>
      <text x="2.5" y="22" fontSize="7" fill="currentColor" stroke="none">3</text>
      <line x1="9.5" y1="6.5" x2="20" y2="6.5" />
      <line x1="9.5" y1="12" x2="20" y2="12" />
      <line x1="9.5" y1="17.5" x2="20" y2="17.5" />
    </svg>
  );
}

function IconLink({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.5 5a3.5 3.5 0 0 1 5 5L16 11.5" />
      <path d="M13 17.5 11.5 19a3.5 3.5 0 0 1-5-5L8 12.5" />
    </svg>
  );
}

function IconImage({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4 16.5 9 12l3 3 3.5-3.5L20 16" />
    </svg>
  );
}

function IconTag({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4h6a2 2 0 0 1 2 2v6l-9 9-8-8z" />
      <circle cx="14.5" cy="9.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface RichTextEditorProps {
  initialHtml?: string;
  onChange: (html: string) => void;
}

/**
 * Minimal contentEditable-based rich text editor. Uncontrolled by design —
 * the DOM is the source of truth and onChange only mirrors it out to the
 * parent — feeding `value` back into the DOM on every keystroke would jump
 * the caret, a well-known contentEditable + React pitfall. `document.
 * execCommand` is deprecated but still broadly supported across evergreen
 * browsers for exactly these basic formatting commands, and pulling in a
 * full editor library (Tiptap/Quill/etc.) isn't worth it for one internal
 * admin tool, matching the rest of this app's no-component-library style.
 */
export default function RichTextEditor({ initialHtml, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const emitChange = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? "");
  }, [onChange]);

  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, value);
      emitChange();
    },
    [emitChange]
  );

  const insertLink = useCallback(() => {
    const url = window.prompt("Link URL:");
    if (url) exec("createLink", url);
  }, [exec]);

  const insertImage = useCallback(() => {
    const url = window.prompt("Image URL:");
    if (url) exec("insertImage", url);
  }, [exec]);

  const insertNameTag = useCallback(() => {
    exec("insertText", "{{name}}");
  }, [exec]);

  return (
    <div className="rte-shell">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" className="rte-btn" title="Bold" onClick={() => exec("bold")}>
          <IconBold className="rte-icon" />
        </button>
        <button type="button" className="rte-btn" title="Italic" onClick={() => exec("italic")}>
          <IconItalic className="rte-icon" />
        </button>
        <button type="button" className="rte-btn" title="Underline" onClick={() => exec("underline")}>
          <IconUnderline className="rte-icon" />
        </button>
        <span className="rte-divider" />
        <button type="button" className="rte-btn" title="Heading" onClick={() => exec("formatBlock", "H2")}>
          <IconHeading className="rte-icon" />
        </button>
        <button type="button" className="rte-btn" title="Bulleted list" onClick={() => exec("insertUnorderedList")}>
          <IconBulletList className="rte-icon" />
        </button>
        <button type="button" className="rte-btn" title="Numbered list" onClick={() => exec("insertOrderedList")}>
          <IconNumberedList className="rte-icon" />
        </button>
        <span className="rte-divider" />
        <button type="button" className="rte-btn" title="Insert link" onClick={insertLink}>
          <IconLink className="rte-icon" />
        </button>
        <button type="button" className="rte-btn" title="Insert image" onClick={insertImage}>
          <IconImage className="rte-icon" />
        </button>
        <span className="rte-divider" />
        <button type="button" className="rte-btn rte-btn-tag" title="Insert recipient's name" onClick={insertNameTag}>
          <IconTag className="rte-icon" />
          <span>Name</span>
        </button>
      </div>
      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        dangerouslySetInnerHTML={initialHtml ? { __html: initialHtml } : undefined}
        data-placeholder="Write the email…"
      />
    </div>
  );
}
