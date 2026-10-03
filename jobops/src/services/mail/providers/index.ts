import { gmail } from "./gmail";
import { outlook } from "./outlook";
import type { MailProvider } from "./types";
export const providers: MailProvider[] = [gmail, outlook];
export function providerFor(id: string): MailProvider {
  const provider = providers.find((provider) => provider.id === id);
  if (!provider) throw new Error(`Unknown or unavailable mail provider: ${id}.`);
  return provider;
}
export function providerBySlug(slug: string): MailProvider {
  const provider = providers.find((provider) => provider.slug === slug);
  if (!provider) throw new Error(`Unknown or unavailable mail provider: ${slug}.`);
  return provider;
}
