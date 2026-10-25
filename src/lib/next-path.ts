// Only same-site relative paths are accepted as a post-login destination, so the "next" parameter cannot be used
// to send a visitor to another website.
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.includes("\n") ? value : "/";
}
