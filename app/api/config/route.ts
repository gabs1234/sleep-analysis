import { NextResponse } from "next/server";

export async function GET() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID || null;
  return NextResponse.json({
    googleClientId,
  });
}
