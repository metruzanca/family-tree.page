import { For, type JSX } from "solid-js";
import { useI18n } from "./LocaleProvider";
import type { TranslationKey, TranslationParams } from "./index";

/**
 * Renders a translated string that contains inline elements, such as a link
 * inside a sentence. Tokens in the JSON (`{terms}`) are replaced with the
 * matching component.
 */
export function Trans(props: {
  key: TranslationKey;
  params?: TranslationParams;
  components?: Record<string, JSX.Element>;
  fallback?: JSX.Element;
}) {
  const { t } = useI18n();

  const parts = () => {
    const text = t(props.key, props.params);
    if (!props.components) return [text];

    return text.split(/(\{\w+\})/g).map(part => {
      const match = /^\{(\w+)\}$/.exec(part);
      const component = match ? props.components?.[match[1]] : undefined;
      return component ?? part;
    });
  };

  return <For each={parts()}>{part => <>{part}</>}</For>;
}
