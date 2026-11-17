import type { JSX } from "solid-js";

export function FileUploadButton(props: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  class?: string;
  testId?: string;
  children: JSX.Element;
}) {
  let input!: HTMLInputElement;

  return (
    <>
      <button
        type="button"
        class={props.class}
        disabled={props.disabled}
        data-testid={props.testId}
        onClick={() => input.click()}
      >
        {props.children}
      </button>
      <input
        ref={input}
        type="file"
        class="sr-only"
        accept={props.accept ?? "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,application/pdf,text/plain,text/markdown,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf"}
        multiple={props.multiple}
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) props.onFiles(files);
        }}
      />
    </>
  );
}
