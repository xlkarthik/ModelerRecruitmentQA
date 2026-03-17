import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export async function POST(request: Request) {
  try {
    const { renders, references, stats, summary } = await request.json();

    // Create a PDF document
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];
    
    doc.on('data', (chunk) => buffers.push(chunk));
    
    // Add content to the PDF
    doc.fontSize(24).text('3D Model QA Report', { align: 'center' });
    doc.moveDown();
    
    // Add reference and render images
    if (renders?.length > 0) {
      doc.fontSize(16).text('Model Renders', { underline: true });
      doc.moveDown();
      
      // You can add image data directly from the base64 strings
      // For simplicity, we'll skip image embedding here
      doc.text(`${renders.length} render images included in analysis`);
      doc.moveDown();
    }
    
    // Add technical details
    doc.fontSize(16).text('Technical Details', { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    
    if (stats) {
      doc.text(`Meshes: ${stats.meshCount || 'N/A'}`);
      doc.text(`Materials: ${stats.materialCount || 'N/A'}`);
      doc.text(`Vertices: ${stats.vertices || 'N/A'}`);
      doc.text(`Triangles: ${stats.triangles || 'N/A'}`);
      doc.text(`Double-Sided Count: ${stats.doubleSidedCount || 'N/A'}`);
      doc.text(`Material Names: ${(stats.doubleSidedMaterials || []).join(', ') || 'N/A'}`);
    }
    
    // Add QA summary
    doc.moveDown();
    doc.fontSize(16).text('QA Summary', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(summary || 'No QA summary provided');
    
    // Finalize PDF
    doc.end();
    
    // Wait for PDF generation to complete
    const pdfBuffer = Buffer.concat(buffers);
    
    // Return the PDF as a response
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=qa-report.pdf',
      },
    });
    
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred generating the PDF' },
      { status: 500 }
    );
  }
}