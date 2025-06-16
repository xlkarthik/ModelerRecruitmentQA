// app/api/save-screenshots/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import path from "path";

// Helper function to create directory
function mkdirSync(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (err) {
    console.error(`Error creating directory ${dirPath}:`, err);
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("API route called");

  try {
    // Parse the FormData
    const formData = await request.formData();
    const modelName = formData.get("modelName")?.toString() || "unknown-model";

    console.log("Model name:", modelName);

    // Create directory path
    const baseDir = path.join(process.cwd(), "public", "screenshots");
    const modelDir = path.join(baseDir, modelName);

    // Create base directory first
    if (!mkdirSync(baseDir)) {
      throw new Error("Could not create base screenshots directory");
    }

    // Create model directory
    if (!mkdirSync(modelDir)) {
      throw new Error(`Could not create directory for model: ${modelName}`);
    }

    const savedUrls: string[] = [];
    const keys = Array.from(formData.keys()).filter(
      (key) => key !== "modelName"
    );

    console.log(`Processing ${keys.length} screenshots`);

    // Process each file in the form data
    for (const key of keys) {
      const value = formData.get(key);
      if (!(value instanceof Blob)) continue;

      const viewIndex = key.split("-")[1];
      const fileName = `${modelName}-view-${viewIndex}.png`;
      const filePath = path.join(modelDir, fileName);

      console.log(`Saving screenshot ${viewIndex} to ${filePath}`);

      // Convert Blob to Buffer
      const arrayBuffer = await value.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Write file synchronously to avoid async issues
      fs.writeFileSync(filePath, buffer);

      // Create URL path
      const urlPath = `/screenshots/${modelName}/${fileName}`;
      savedUrls.push(urlPath);

      console.log(`Screenshot ${viewIndex} saved at ${urlPath}`);
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: `Saved ${savedUrls.length} screenshots`,
      urls: savedUrls,
    });
  } catch (error) {
    console.error("Error in save-screenshots API:", error);

    // Return error response
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      },
      { status: 500 }
    );
  }
}
