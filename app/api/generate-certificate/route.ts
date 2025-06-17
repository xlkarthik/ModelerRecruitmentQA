// First, install the library: npm install @react-pdf/renderer

// app/api/generate-certificate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Font,
} from "@react-pdf/renderer";

// Register fonts (optional - you can skip this to use default fonts)
// Font.register({
//   family: 'Open Sans',
//   src: 'https://fonts.gstatic.com/s/opensans/v18/mem8YaGs126MiZpBA-UFVZ0e.ttf'
// });

const styles = StyleSheet.create({
  page: {
    backgroundColor: "white",
    padding: 60,
    fontFamily: "Helvetica",
  },
  header: {
    backgroundColor: "#667eea",
    padding: 40,
    marginBottom: 40,
    borderRadius: 8,
  },
  title: {
    fontSize: 36,
    color: "white",
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: "white",
    textAlign: "center",
  },
  certifyText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#2d3748",
  },
  candidateName: {
    fontSize: 42,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
    color: "#2d3748",
  },
  achievementText: {
    fontSize: 20,
    textAlign: "center",
    marginBottom: 10,
    color: "#2d3748",
  },
  scoresContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 40,
  },
  scoreItem: {
    alignItems: "center",
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#38a169",
    marginBottom: 5,
  },
  scoreLabel: {
    fontSize: 12,
    color: "#718096",
    textTransform: "uppercase",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 60,
  },
  footerLeft: {
    flex: 1,
  },
  footerRight: {
    flex: 1,
    alignItems: "center",
  },
  dateText: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 5,
  },
  certificateId: {
    fontSize: 10,
    color: "#718096",
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#718096",
    width: 150,
    marginBottom: 10,
  },
  signatureText: {
    fontSize: 12,
    textAlign: "center",
    color: "#718096",
  },
  companyLogo: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#667eea",
  },
});

const CertificateDocument = ({ data }: { data: any }) => (
  <Document>
    <Page size={[842, 595]} style={styles.page} orientation="landscape">
      <View style={styles.header}>
        <Text style={styles.title}>CERTIFICATE OF ACHIEVEMENT</Text>
        <Text style={styles.subtitle}>3D Modeling Worktest Completion</Text>
      </View>

      <Text style={styles.certifyText}>This is to certify that</Text>

      <Text style={styles.candidateName}>{data.candidateName}</Text>

      <Text style={styles.achievementText}>
        has successfully completed the {data.worktestLevel} LEVEL
      </Text>
      <Text style={styles.achievementText}>
        3D Modeling Worktest with outstanding results
      </Text>

      <View style={styles.scoresContainer}>
        {[
          {
            label: "Silhouette",
            value: data.similarityScores.silhouette || "N/A",
          },
          {
            label: "Proportion",
            value: data.similarityScores.proportion || "N/A",
          },
          {
            label: "Color/Material",
            value: data.similarityScores.colorMaterial || "N/A",
          },
          { label: "Overall", value: data.similarityScores.overall || "N/A" },
        ].map((score, index) => (
          <View key={index} style={styles.scoreItem}>
            <Text style={styles.scoreValue}>
              {score.value}
              {typeof score.value === "number" ? "%" : ""}
            </Text>
            <Text style={styles.scoreLabel}>{score.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.companyLogo}>CharpstAR</Text>
          <Text style={styles.dateText}>Date: {data.completionDate}</Text>
          <Text style={styles.certificateId}>
            Certificate ID: {data.certificateId}
          </Text>
        </View>
        <View style={styles.footerRight}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureText}>CharpstAR Team</Text>
        </View>
      </View>
    </Page>
  </Document>
);

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

    // Get job details from database
    const { data: job, error } = await supabase
      .from("qa_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse QA results
    let qaResults = null;
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

    // Check if model is approved
    if (!qaResults || qaResults.status !== "Approved") {
      return NextResponse.json(
        { error: "Certificate can only be generated for approved models" },
        { status: 400 }
      );
    }

    // Generate PDF certificate
    const certificateData = {
      candidateName,
      worktestLevel: worktestLevel.toUpperCase(),
      completionDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      jobId,
      certificateId: `CSTAR-${worktestLevel.toUpperCase()}-${Date.now()}`,
      similarityScores: qaResults.similarityScores || {},
    };

    const pdfBuffer = await pdf(
      <CertificateDocument data={certificateData} />
    ).toBuffer();

    // Return PDF as download
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CharpstAR_Certificate_${candidateName.replace(
          /\s+/g,
          "_"
        )}_${worktestLevel}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("Certificate generation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate certificate" },
      { status: 500 }
    );
  }
}
