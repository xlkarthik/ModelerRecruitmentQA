import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file found" }, { status: 400 });
    }

    const ext = path.extname(file.name); // preserve extension (.png, .jpg)
    const uniqueName = `${uuidv4()}${ext}`;

    const blob = await put(uniqueName, file.stream(), {
      access: "public",
    });

    return NextResponse.json({ url: blob.url });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
