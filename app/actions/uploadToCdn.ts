// app/actions/uploadToCdn.ts
"use server";

import { OpenAI } from "openai";
import fs from "fs";
import path from "path";

// write your Bunny upload helper once
async function putBunny(buffer: Buffer, remotePath: string) {
  const zone = process.env.BUNNY_ZONE_NAME!;
  const key = process.env.BUNNY_STORAGE_KEY!;
  const pull = process.env.BUNNY_PULL_HOST!;
  const url = `https://storage.bunnycdn.com/${zone}/${remotePath}`;
  const res = await fetch(url, {
    method: "PUT",
    cache: "no-store", // ← tell Next: don’t cache this request
    headers: {
      AccessKey: key,
      "Content-Type": "model/gltf-binary",
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Bunny upload failed: ${res.status}`);
  return `${pull}/${remotePath}`;
}

export async function uploadAssets(formData: FormData) {
  // 1) grab the GLB file
  const glbFile = formData.get("glb") as File | null;
  if (!glbFile) throw new Error(".glb is required");

  // 2) upload GLB
  const glbBuf = Buffer.from(await glbFile.arrayBuffer());
  const glbName = `qa-assets/${Date.now()}-${glbFile.name}`;
  const glbUrl = await putBunny(glbBuf, glbName);

  // 3) upload up to 5 reference images
  const refUrls: string[] = [];
  for (let i = 0; i < 5; i++) {
    const blob = formData.get(`refs[${i}]`) as File | null;
    if (!blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    const name = `qa-assets/${Date.now()}-ref-${i}-${blob.name}`;
    refUrls.push(await putBunny(buf, name));
  }

  // 4) (optional) call OpenAI, do QA logic…
  //    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  //    …

  return { glbUrl, refUrls };
}
