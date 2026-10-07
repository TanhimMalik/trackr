import { describe, expect, it, vi } from "vitest";
import { fetchCompanyLogo, isLogoDomain } from "./logos";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;

const respond = (body: BodyInit | null, init: ResponseInit) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(body, init));

describe("isLogoDomain", () => {
  it.each(["stripe.com", "datadoghq.com", "bbc.co.uk", "linear.app"])(
    "accepts %s",
    (domain) => {
      expect(isLogoDomain(domain)).toBe(true);
    },
  );

  it.each([
    "localhost",
    "127.0.0.1",
    "stripe",
    "https://stripe.com",
    "stripe.com/logo",
    "STRIPE.COM",
    "-bad.com",
    "a".repeat(250) + ".com",
  ])("rejects %s", (domain) => {
    expect(isLogoDomain(domain)).toBe(false);
  });
});

describe("fetchCompanyLogo", () => {
  it("returns raster images", async () => {
    const fetchImpl = respond(png, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
    const logo = await fetchCompanyLogo("stripe.com", fetchImpl);

    expect(logo?.contentType).toBe("image/png");
    expect(logo?.body.byteLength).toBe(4);
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://www.google.com/s2/favicons?domain=stripe.com&sz=128",
    );
  });

  it("never requests anything for an invalid domain", async () => {
    const fetchImpl = respond(png, { status: 200 });
    expect(await fetchCompanyLogo("evil.com/../x", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a missing logo as none", async () => {
    expect(
      await fetchCompanyLogo(
        "unknown-company.com",
        respond(png, { status: 404, headers: { "content-type": "image/png" } }),
      ),
    ).toBeNull();
  });

  it("refuses SVG and non-image responses", async () => {
    for (const type of ["image/svg+xml", "text/html; charset=utf-8"]) {
      expect(
        await fetchCompanyLogo(
          "stripe.com",
          respond("<svg/>", { status: 200, headers: { "content-type": type } }),
        ),
      ).toBeNull();
    }
  });

  it("refuses oversized images", async () => {
    expect(
      await fetchCompanyLogo(
        "stripe.com",
        respond(new Uint8Array(300_000).buffer, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    ).toBeNull();
  });

  it("falls back when the provider is unreachable", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchCompanyLogo("stripe.com", fetchImpl)).toBeNull();
  });
});
