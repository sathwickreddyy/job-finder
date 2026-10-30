import { expect, it, vi } from "vitest";
import { disconnectInbox } from "@/features/mail/actions";
const mocks = vi.hoisted(() => ({ disconnect: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/services/mail/providers/connections", () => ({
  disconnectConnection: mocks.disconnect,
}));
it("disconnects through the shared service and explains external grant removal", async () => {
  mocks.disconnect.mockResolvedValue({ email: "b@outlook.in" });
  const form = new FormData();
  form.set("connectionId", "00000000-0000-4000-8000-000000000002");
  expect(await disconnectInbox({}, form)).toMatchObject({
    success: expect.stringContaining("Google or Microsoft account permissions"),
  });
  expect(mocks.disconnect).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
});
