// app/api/generate-certificate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { jsPDF } from "jspdf";

export async function POST(request: NextRequest) {
  try {
    const { jobId, candidateName, worktestLevel } = await request.json();

    if (!jobId || !candidateName || !worktestLevel) {
      return NextResponse.json(
        {
          error: "Missing required fields: jobId, candidateName, worktestLevel",
        },
        { status: 400 }
      );
    }

    // Fetch job details
    const { data: job, error: fetchError } = await supabase
      .from("qa_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse QA results
    let qaResults: { status?: string; similarityScores?: any } | null = null;
    if (job.qa_results) {
      try {
        qaResults = JSON.parse(job.qa_results);
      } catch (e) {
        console.error("Failed to parse QA results:", e);
        return NextResponse.json(
          { error: "Invalid QA results data" },
          { status: 500 }
        );
      }
    }

    // Only approved models get passes
    if (!qaResults || qaResults.status !== "Approved") {
      return NextResponse.json(
        { error: "Pass can only be generated for approved models" },
        { status: 400 }
      );
    }

    // Build pass data
    const passData = {
      candidateName,
      worktestLevel: worktestLevel.toUpperCase(),
      completionDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      certificateId: `PASS-${worktestLevel.toUpperCase()}-${Date.now()}`,
      similarityScores: qaResults.similarityScores || {},
    };

    // Generate PDF
    const pdfBuffer = await generatePassPDF(passData);

    // Return as download
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CharpstAR_QA_Pass_${candidateName.replace(
          /\s+/g,
          "_"
        )}_${worktestLevel.toUpperCase()}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("Pass generation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate pass" },
      { status: 500 }
    );
  }
}

// Helper: fetch an image URL and convert to Base64
async function getImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error("Error fetching logo:", error);
    return null;
  }
}

// Core: builds the QA Pass PDF
async function generatePassPDF(data: {
  candidateName: string;
  worktestLevel: string;
  completionDate: string;
  certificateId: string;
  similarityScores: any;
}): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Outer border
  doc.setDrawColor("#CCCCCC").setLineWidth(1);
  doc.rect(margin, margin, W - margin * 2, H - margin * 2);

  // Header background
  doc.setFillColor(245, 245, 245);
  doc.rect(margin + 1, margin + 1, W - (margin + 1) * 2, 70, "F");

  // Logo (reduced by 30%, centered)
  const logoData = await getImageAsBase64(
    "https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png"
  );
  const originalW = 80,
    originalH = 20;
  const logoW = originalW * 0.7,
    logoH = originalH * 0.7;
  const logoX = (W - logoW) / 2,
    logoY = margin + 5;
  if (logoData) {
    doc.addImage(logoData, "PNG", logoX, logoY, logoW, logoH);
  }

  // Title ("QA Pass") & Subtitle
  const titleY = logoY + logoH + 18;
  const subtitleY = titleY + 14;

  doc.setFont("helvetica", "bold").setFontSize(30).setTextColor(33);
  doc.text("QA PASS", W / 2, titleY, { align: "center" });

  doc.setDrawColor("#666666").setLineWidth(0.5);
  doc.line(W / 2 - 30, titleY + 4, W / 2 + 50, titleY + 4);

  doc.setFont("helvetica", "normal").setFontSize(14).setTextColor(80);
  doc.text("3D Modeling Worktest Completion", W / 2, subtitleY, {
    align: "center",
  });

  // Body text
  let y = subtitleY + 20;
  doc.setFontSize(16).setTextColor(100);
  doc.text("This is to certify that", W / 2, y, { align: "center" });

  y += 20;
  doc.setFont("times", "bolditalic").setFontSize(36).setTextColor(21);
  doc.text(data.candidateName, W / 2, y, { align: "center" });

  y += 10;
  doc.setDrawColor(100).setLineWidth(0.7);
  doc.line(W / 2 - 60, y, W / 2 + 60, y);

  // Instruction block (30mm above footer)
  const footerY = H - margin - 25;
  const instructionY = footerY - 30;
  doc.setFont("helvetica", "italic").setFontSize(12).setTextColor(33);
  const lines = [
    `has successfully completed the initial ${data.worktestLevel} level worktest!`,
    `Please download this pass and email it along with your exported .glb model`,
    `to recruitment@charpstar.com for further review.`,
  ];
  doc.text(lines, W / 2, instructionY, {
    align: "center",
    maxWidth: W - margin * 2,
    lineHeightFactor: 1.5,
  });

  // Footer
  doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(100);
  doc.text(`Date: ${data.completionDate}`, margin + 10, footerY);
  doc.text(`Pass ID: ${data.certificateId}`, margin + 10, footerY + 6);

  const sigX = W - margin - 60;
  doc.setDrawColor(33).setLineWidth(0.5);
  doc.line(sigX, footerY, sigX + 50, footerY);

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(80);
  doc.text("Authorized Signatory", sigX + 25, footerY + 6, { align: "center" });
  doc.text("CharpstAR Team", sigX + 25, footerY + 12, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
