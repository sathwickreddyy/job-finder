import type { Locator } from "@playwright/test";

/**
 * Waits until React has hydrated this element, so a click runs its handlers instead of a
 * plain form post or link. A large page can paint well before its scripts take over.
 */
export async function hydrated(locator: Locator) {
  await locator.waitFor();
  await locator.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const ready = () => Object.keys(element).some((key) => key.startsWith("__reactProps$"));
        const check = () => (ready() ? resolve() : requestAnimationFrame(check));
        check();
      }),
  );
}
