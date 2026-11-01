// Blocks every page except the login screen until the team code session cookie is valid.
export const config = { matcher: ["/((?!api/|assets/|login|login\.html).*)"] };

const sha256 = async (text) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export default async function middleware(request) {
  const team = process.env.TEAM_CODE;
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("asb_session="))?.slice("asb_session=".length);
  if (team && token && token === (await sha256("team|" + team))) {
    return new Response(null, { headers: { "x-middleware-next": "1" } });
  }
  return new Response(null, { status: 307, headers: { location: "/login" } });
}
