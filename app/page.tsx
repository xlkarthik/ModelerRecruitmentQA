/* eslint-disable react/no-unescaped-entities */

"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  DragEvent,
  ChangeEvent,
} from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "camera-controls"?: boolean;
          "camera-orbit"?: string;
          "shadow-intensity"?: string;
          loading?: string;
          reveal?: string;
          exposure?: string;
          "field-of-view"?: string;
          "environment-image"?: string;
          style?: React.CSSProperties | string;
          onLoad?: () => void;
          onError?: () => void;
        },
        HTMLElement
      >;
    }
  }
}

type ModelViewerElement = HTMLElement & {
  toDataURL: (type?: string, quality?: number) => string;
  updateComplete: Promise<boolean>;
  cameraOrbit: string;
  addEventListener: (
    event: string,
    callback: () => void,
    options?: { once: boolean }
  ) => void;
  removeEventListener: (event: string, callback: () => void) => void;
};

type DifficultyLevel = "easy" | "medium" | "hard";

interface WorktestSpecs {
  title: string;
  maxTriangles: number;
  maxMaterials: number;
  maxFileSize: number;
  dimensions: string;
}

const WORKTEST_CONFIG: Record<DifficultyLevel, WorktestSpecs> = {
  easy: {
    title: "Easy Worktest - Retro Sofa",
    maxTriangles: 50000,
    maxMaterials: 3,
    maxFileSize: 8,
    dimensions:
      "Width: 176 cm, Depth: 81 cm, Height: 77 cm, Seat Width: 143 cm, Seat Depth: 65 cm, Seat Height: 43 cm, Leg Height: 22 cm, Backrest Height: 36 cm",
  },
  medium: {
    title: "Medium Worktest - Rattan Sofa",
    maxTriangles: 100000,
    maxMaterials: 4,
    maxFileSize: 12,
    dimensions:
      "3-Seater: Length: 180 cm, Width: 70 cm, Armrest Height: 50 cm, Total Height: 80 cm",
  },
  hard: {
    title: "Hard Worktest - Woven Rattan Sofa",
    maxTriangles: 150000,
    maxMaterials: 5,
    maxFileSize: 15,
    dimensions:
      "Width:192cm, Depth:65cm, Height:74cm, Seat Width:178cm, Seat Depth:45cm, Seat Cushion Height:14cm, Seat Height:46cm, Leg Height:25cm",
  },
};

const REFERENCE_IMAGES: Record<DifficultyLevel, string[]> = {
  easy: [
    "https://cdn2.charpstar.net/Worktest/Easy/1.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/2.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/3.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/5.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/6.webp",
  ],
  medium: [
    "https://cdn2.charpstar.net/Worktest/Medium/1.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/2.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/3.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/4.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/5.webp",
  ],
  hard: [
    "https://cdn2.charpstar.net/Worktest/Hard/1.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/2.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/3.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/4.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/5.webp",
  ],
};

export default function WorktestQA() {
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<DifficultyLevel>("easy");
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [glbPreviewUrl, setGlbPreviewUrl] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qaComplete, setQaComplete] = useState(false);
  const [loadingQA, setLoadingQA] = useState(false);
  const [fact, setFact] = useState<string>("");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [candidateName, setCandidateName] = useState<string>("");
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [certificateData, setCertificateData] = useState<any>(null);
  const [certificateGenerated, setCertificateGenerated] = useState(false);
  const [certificateFileName, setCertificateFileName] = useState<string>("");
  const [certificateBlob, setCertificateBlob] = useState<Blob | null>(null);
  const [modelStats, setModelStats] = useState<{
    meshCount: number;
    materialCount: number;
    vertices: number;
    triangles: number;
    doubleSidedCount: number;
    doubleSidedMaterials: string[];
  } | null>(null);
  const [qaResults, setQaResults] = useState<{
    summary?: string;
    status?: string;
    differences?: Array<{
      renderIndex: number;
      referenceIndex: number;
      issues: string[];
      bbox: number[];
      severity: string;
    }>;
    similarityScores?: {
      silhouette?: number;
      proportion?: number;
      colorMaterial?: number;
      overall?: number;
    };
  } | null>(null);

  const viewerRef = useRef<ModelViewerElement | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const facts = useMemo(
    () => [
      "Charpstar is an Augmented Reality Company founded in 2016, focused on transforming e-commerce through Web AR.",
      "3D models in e-commerce can increase conversion rates by up to 40% compared to traditional 2D images.",
      "Charpstar works with some of the biggest retail clients in Europe, driving new shopping behaviors through AR.",
      "The first 3D computer graphics were created in the 1960s, but realistic 3D rendering took decades to develop.",
      "3D file formats like glTF are optimized for web delivery, making AR experiences faster and more accessible.",
      "Charpstar is led by two co-founders with different backgrounds who strive to build market share daily.",
      "3D scanning technologies can now capture real-world objects with sub-millimeter accuracy.",
      "WebGL and WebXR technologies have made 3D experiences possible directly in web browsers without plugins.",
      "Real-time 3D rendering was once only possible on specialized hardware but now works on most smartphones.",
      "Charpstar creates a creative playground for like-minded people to achieve success in the emerging AR field.",
      "The global AR market is projected to reach $340 billion by 2028, with retail as one of the fastest-growing segments.",
      "Modern 3D modeling software can simulate realistic physics, materials, and lighting for photorealistic results.",
    ],
    []
  );

  // Load model-viewer script
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (customElements.get("model-viewer")) {
      setViewerReady(true);
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://cdn2.charpstar.net/QATool/qa-tool-viewer.js.js";
    script.onload = () => {
      console.log("model-viewer defined!");
      customElements.whenDefined("model-viewer").then(() => {
        setViewerReady(true);
      });
    };
    script.onerror = () => {
      console.error("Failed to load <model-viewer> script");
      setError("Could not load 3D viewer.");
    };
    document.head.appendChild(script);
  }, []);

  // Poll for job status - WITH EXPONENTIAL BACKOFF AND RATE LIMIT PROTECTION
  useEffect(() => {
    if (!currentJobId || qaComplete) return;

    console.log("Starting intelligent polling for job:", currentJobId);

    let timeoutId: NodeJS.Timeout;
    let isActive = true;
    let pollCount = 0;
    let backoffDelay = 5000; // Start with 5 seconds
    const maxBackoffDelay = 30000; // Max 30 seconds between polls
    const maxPolls = 60; // Reduce max polls since we're using longer intervals

    const checkJobStatus = async () => {
      if (!isActive) return;

      pollCount++;
      console.log(
        `Intelligent poll #${pollCount} for job ${currentJobId} (delay: ${backoffDelay}ms)`
      );

      // Timeout after reasonable time with longer intervals
      if (pollCount > maxPolls) {
        console.error(
          "⏰ Job polling timeout - stopping after extended period"
        );
        setError("Job is taking too long to complete. Please try again.");
        setLoadingQA(false);
        isActive = false;
        return;
      }

      try {
        const response = await fetch(`/api/qa-jobs?jobId=${currentJobId}`);

        if (!response.ok) {
          // Handle rate limiting gracefully
          if (response.status === 429) {
            console.warn("🚦 Rate limited - increasing backoff delay");
            backoffDelay = Math.min(backoffDelay * 2, maxBackoffDelay);

            const retryAfter = response.headers.get("Retry-After");
            const waitTime = retryAfter
              ? parseInt(retryAfter) * 1000
              : backoffDelay;

            if (isActive) {
              timeoutId = setTimeout(checkJobStatus, waitTime);
            }
            return;
          }

          console.error(`Job status check failed: ${response.status}`);
          setError(`Failed to check job status: ${response.statusText}`);
          setLoadingQA(false);
          isActive = false;
          return;
        }

        const data = await response.json();
        console.log(`Job status response (poll #${pollCount}):`, data.status);

        if (!isActive) return;

        if (data.status === "complete") {
          console.log("🎉 Job completed! Stopping polling...");

          if (data.qaResults) {
            console.log("📊 QA Results:", data.qaResults);
            setQaResults(data.qaResults);
          } else {
            console.warn("⚠️ No QA results in response");
          }

          setQaComplete(true);
          setLoadingQA(false);
          isActive = false;
        } else if (data.status === "failed") {
          console.error("❌ Job failed:", data.error);
          setError(data.error || "QA processing failed");
          setLoadingQA(false);
          isActive = false;
        } else {
          console.log(
            `⏳ Job still ${data.status}, continuing with exponential backoff... (${pollCount}/${maxPolls})`
          );

          // Successful poll - can reduce backoff slightly but keep it reasonable
          if (backoffDelay > 5000) {
            backoffDelay = Math.max(backoffDelay * 0.9, 5000);
          }

          // Schedule next poll with current backoff delay
          if (isActive) {
            timeoutId = setTimeout(checkJobStatus, backoffDelay);
          }
        }
      } catch (err: any) {
        console.error("Error checking job status:", err);

        // On network errors, increase backoff
        backoffDelay = Math.min(backoffDelay * 1.5, maxBackoffDelay);

        if (pollCount < maxPolls && isActive) {
          console.log(`Retrying in ${backoffDelay}ms due to error...`);
          timeoutId = setTimeout(checkJobStatus, backoffDelay);
        } else {
          setError(`Failed to check job status: ${err.message}`);
          setLoadingQA(false);
          isActive = false;
        }
      }
    };

    // Start first poll immediately
    checkJobStatus();

    // Cleanup function
    return () => {
      console.log("🧹 Cleaning up intelligent polling for job:", currentJobId);
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [currentJobId, qaComplete]);

  // Rotate through facts while loading
  useEffect(() => {
    if (!loadingQA) return;

    setFact(facts[Math.floor(Math.random() * facts.length)]);

    const interval = setInterval(() => {
      setFact(facts[Math.floor(Math.random() * facts.length)]);
    }, 5000);

    return () => clearInterval(interval);
  }, [loadingQA, facts]);

  // Handle model loading
  useEffect(() => {
    if (!viewerReady || !glbPreviewUrl || !viewerRef.current) return;
    const viewer = viewerRef.current;

    const onLoad = () => {
      console.log("Model loaded!");
      setStatusMessage("Model loaded—taking screenshots...");
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

      try {
        if ((viewer as any).getModelStats) {
          const stats = (viewer as any).getModelStats();
          setModelStats(stats);
          console.log("Model stats:", stats);
        }
      } catch (err) {
        console.error("Error getting model stats:", err);
      }

      captureScreenshots();
    };

    const onError = () => {
      console.error("Model load error");
      setError("Failed to load 3D model");
      setIsProcessing(false);
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };

    viewer.addEventListener("load", onLoad, { once: true });
    viewer.addEventListener("error", onError, { once: true });

    loadTimeoutRef.current = setTimeout(() => {
      console.warn("Model load timed out");
      onError();
    }, 30_000);

    return () => {
      viewer.removeEventListener("load", onLoad);
      viewer.removeEventListener("error", onError);
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [viewerReady, glbPreviewUrl]);

  const prevent = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const generateCertificate = async () => {
    if (!candidateName.trim()) {
      setError("Please enter your name to generate the certificate");
      return;
    }

    if (!currentJobId || !qaResults) {
      setError("No QA results available for certificate generation");
      return;
    }

    try {
      const response = await fetch("/api/generate-certificate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: currentJobId,
          candidateName: candidateName.trim(),
          worktestLevel: selectedDifficulty,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate certificate");
      }

      // Store the blob for download later
      const blob = await response.blob();
      const fileName = `CharpstAR_Certificate_${candidateName.replace(
        /\s+/g,
        "_"
      )}_${selectedDifficulty}.pdf`;

      setCertificateBlob(blob);
      setCertificateFileName(fileName);
      setCertificateGenerated(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const downloadCertificate = () => {
    if (certificateBlob && certificateFileName) {
      const url = window.URL.createObjectURL(certificateBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = certificateFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const generateVerificationId = () => {
    // Generate a simple verification ID based on job ID and timestamp
    const timestamp = Date.now().toString(36);
    const jobIdShort = currentJobId?.slice(-8) || "unknown";
    return `CHR-${selectedDifficulty.toUpperCase()}-${jobIdShort}-${timestamp}`;
  };

  const resetAll = () => {
    setGlbFile(null);
    setGlbPreviewUrl(null);
    setScreenshots([]);
    setStatusMessage("");
    setError(null);
    setQaComplete(false);
    setLoadingQA(false);
    setModelStats(null);
    setCurrentJobId(null);
    setCandidateName("");
    setShowCertificateModal(false);
    setCertificateData(null);
    setCertificateGenerated(false);
    setCertificateFileName("");
    setCertificateBlob(null);

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
  };

  const processFile = (file: File | null) => {
    if (!file || !file.name.toLowerCase().endsWith(".glb")) {
      setError("Please select a valid .glb file");
      return;
    }
    resetAll();
    setGlbFile(file);
    setGlbPreviewUrl(URL.createObjectURL(file));
    setStatusMessage("Loading model...");
    setIsProcessing(true);
  };

  const handleGlbDrop = (e: DragEvent<HTMLDivElement>) => {
    prevent(e);
    processFile(e.dataTransfer.files[0] ?? null);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) =>
    processFile(e.target.files?.[0] ?? null);

  const captureScreenshots = async () => {
    const viewer = viewerRef.current;
    if (!viewer) {
      setError("Viewer not initialized");
      setIsProcessing(false);
      return;
    }

    const angles = [
      "0deg 75deg 150%",
      "90deg 75deg 150%",
      "180deg 75deg 150%",
      "270deg 75deg 150%",
    ];

    const snaps: string[] = [];

    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      setStatusMessage(`Capturing ${i + 1}/4`);

      viewer.setAttribute("camera-orbit", angle);

      await new Promise<void>((resolve) => {
        const handle = () => {
          viewer.removeEventListener("camera-change", handle);
          resolve();
        };
        viewer.addEventListener("camera-change", handle);
        setTimeout(resolve, 2000);
      });

      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
      await new Promise((r) => setTimeout(r, 500));

      try {
        await viewer.updateComplete;
        const dataUrl = viewer.toDataURL("image/png", 1.0);
        snaps.push(dataUrl);
        console.log(`✅ Captured screenshot ${i + 1} at ${angle}`);
      } catch (err) {
        console.error(`❌ Failed to capture at angle ${angle}`, err);
      }
    }

    if (snaps.length === 4) {
      setScreenshots(snaps);
      setStatusMessage("All screenshots captured");
    } else {
      setError(`Failed to capture all screenshots. Got ${snaps.length}/4`);
    }

    setIsProcessing(false);
  };

  async function uploadFileToBlob(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload failed: ${res.status} ${text}`);
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error("Upload failed: response was not JSON");
    }

    if (!data.url) {
      throw new Error("Upload failed: missing URL in response");
    }

    return data.url;
  }

  const handleRunQA = async () => {
    if (screenshots.length !== 4) {
      setError("Need 4 screenshots from your model");
      return;
    }

    setError(null);
    setStatusMessage("Initializing QA process...");
    setIsProcessing(true);
    setLoadingQA(true);

    try {
      // Get reference URLs for selected difficulty
      const referenceUrls = REFERENCE_IMAGES[selectedDifficulty];

      // Upload screenshots
      const uploadedRenders = await Promise.all(
        screenshots.map(async (base64, i) => {
          const blob = await (await fetch(base64)).blob();
          const file = new File([blob], `render-${i}.png`, {
            type: "image/png",
          });
          return uploadFileToBlob(file);
        })
      );

      // Prepare model stats
      const worktestSpecs = WORKTEST_CONFIG[selectedDifficulty];
      const statsToSend = modelStats
        ? {
            ...modelStats,
            fileSize: glbFile ? glbFile.size : 0,
            worktestLevel: selectedDifficulty,
            requirements: {
              maxTriangles: worktestSpecs.maxTriangles,
              maxMaterials: worktestSpecs.maxMaterials,
              maxFileSize: worktestSpecs.maxFileSize * 1024 * 1024,
            },
          }
        : undefined;

      // Create QA job with reference URLs (not uploaded files)
      const resp = await fetch("/api/qa-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renders: uploadedRenders,
          references: referenceUrls, // Pass URLs directly
          modelStats: statsToSend,
          worktestLevel: selectedDifficulty,
        }),
      });

      if (!resp.ok) {
        const body = await resp
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error || resp.statusText);
      }

      const jobData = await resp.json();
      setCurrentJobId(jobData.jobId);
      setStatusMessage(`QA job started (ID: ${jobData.jobId})`);
    } catch (e: any) {
      setError(e.message || "QA failed");
      setIsProcessing(false);
      setLoadingQA(false);
    }
  };

  const currentSpecs = WORKTEST_CONFIG[selectedDifficulty];
  const referenceImages = REFERENCE_IMAGES[selectedDifficulty];

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50">
      {loadingQA ? (
        // IMPROVED Loading State - Same Structure as Main Interface
        <div className="max-w-4xl mx-auto">
          {/* Logo - Center Aligned */}
          <div className="mb-8 flex justify-center">
            <img
              src="https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png"
              alt="CharpstAR Logo"
              className="h-10"
            />
          </div>

          <h1 className="text-2xl font-bold mb-6 text-center">
            Analyzing Your{" "}
            {selectedDifficulty.charAt(0).toUpperCase() +
              selectedDifficulty.slice(1)}{" "}
            Worktest Model
          </h1>

          {/* Progress Section */}
          <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-center mb-4">
              <svg
                className="animate-spin h-12 w-12 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-center mb-4">
              QA Analysis in Progress
            </h2>
            <p className="text-gray-600 text-center mb-4">
              Our AI is comparing your model against the worktest reference
              images. This may take a minute.
            </p>

            {currentJobId && (
              <div className="text-center text-sm text-gray-500 mb-4">
                Job ID: {currentJobId}
              </div>
            )}
          </div>

          {/* Current Worktest Info */}
          <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Current Worktest: {currentSpecs.title}
            </h2>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-800 space-y-1">
                <p>
                  <strong>Max Triangles:</strong>{" "}
                  {currentSpecs.maxTriangles.toLocaleString()}
                </p>
                <p>
                  <strong>Max Materials:</strong> {currentSpecs.maxMaterials}
                </p>
                <p>
                  <strong>Max File Size:</strong> {currentSpecs.maxFileSize}MB
                </p>
                <p>
                  <strong>Dimensions:</strong> {currentSpecs.dimensions}
                </p>
              </div>
            </div>
          </div>

          {/* Your Model Screenshots */}
          {screenshots.length > 0 && (
            <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Your Model Screenshots (Being Analyzed)
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {screenshots.map((screenshot, index) => (
                  <div
                    key={index}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative"
                  >
                    <img
                      src={screenshot}
                      alt={`Screenshot ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                      <svg
                        className="animate-pulse h-6 w-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reference Images */}
          <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Reference Images ({selectedDifficulty} difficulty)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {referenceImages.map((imageUrl, index) => (
                <div
                  key={index}
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                >
                  <img
                    src={imageUrl}
                    alt={`Reference ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Your model is being compared against these official reference
              images.
            </p>
          </div>

          {/* Fun Fact Section */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              🎯 Did you know?
            </h3>
            <p className="text-gray-700">{fact}</p>
          </div>
        </div>
      ) : qaComplete && qaResults?.status === "Approved" ? (
        // Approved Model - Certificate Generation Only
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 flex justify-center">
            <img
              src="https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png"
              alt="CharpstAR Logo"
              className="h-10"
            />
          </div>

          <h1 className="text-2xl font-bold mb-6">
            Technical Requirements Verified - {currentSpecs.title}
          </h1>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
            {/* Success Message */}
            <div className="p-6 bg-green-50 border-l-4 border-green-500">
              <div className="flex items-center">
                <svg
                  className="w-6 h-6 text-green-500 mr-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-green-800">
                    Technical Requirements Passed!
                  </h3>
                  <p className="text-green-700 mt-1">
                    Your {selectedDifficulty} level model successfully meets all
                    our technical standards. It's now ready for expert human
                    evaluation.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Certificate Generation Section */}
          <div className="flex flex-col gap-4 mb-6">
            {!certificateGenerated ? (
              <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                <h3 className="text-lg font-semibold text-green-800 mb-4">
                  Generate Your Verification Certificate
                </h3>
                <p className="text-green-700 mb-4">
                  Get your official verification document to include with your
                  submission to our recruitment team.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    className="flex-1 px-4 py-3 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <button
                    onClick={generateCertificate}
                    disabled={!candidateName.trim()}
                    className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Generate Certificate
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                <div className="flex items-center mb-4">
                  <svg
                    className="w-8 h-8 text-green-500 mr-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold text-green-800">
                    Certificate Generated Successfully!
                  </h3>
                </div>
                <p className="text-green-700 mb-4">
                  Your verification certificate for{" "}
                  <strong>{candidateName}</strong> is ready. Please send this
                  along with your .glb model to recruitment@charpstar.com.
                </p>
                <button
                  onClick={downloadCertificate}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors mr-4"
                >
                  📄 Download PDF Certificate
                </button>
                <button
                  onClick={() => setCertificateGenerated(false)}
                  className="text-green-600 hover:text-green-700 px-4 py-3 font-medium transition-colors"
                >
                  Generate for Different Name
                </button>
              </div>
            )}

            <button
              onClick={resetAll}
              className="w-full border border-gray-300 text-gray-800 rounded-lg py-4 font-medium hover:bg-gray-50 transition-colors"
            >
              Test Another Model
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <h3 className="font-semibold mb-2 text-blue-900">
              📧 What Happens Next?
            </h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p>
                <strong>1. Submit your work:</strong> Email your certificate and
                .glb model to recruitment@charpstar.com
              </p>
              <p>
                <strong>2. Human QA review:</strong> Our expert team will
                conduct a detailed evaluation of your model
              </p>
              <p>
                <strong>3. Response timeline:</strong> We'll get back to you
                within 3 working days with feedback
              </p>
            </div>
          </div>
        </div>
      ) : qaComplete ? (
        // Non-Approved Model - Full QA Results
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 flex justify-center">
            <img
              src="https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png"
              alt="CharpstAR Logo"
              className="h-10"
            />
          </div>

          <h1 className="text-2xl font-bold mb-6">
            QA Results - {currentSpecs.title}
          </h1>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
            {/* QA Status Header */}
            <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    QA Results
                  </h2>
                  {qaResults?.summary && (
                    <p className="text-gray-700 mt-2 text-base">
                      {qaResults.summary}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div
                    className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                      qaResults?.status === "Approved"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {qaResults?.status === "Approved" ? (
                      <>
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Approved
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Needs Review
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Issues Section for Non-Approved Models */}
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 text-red-600">
                Issues Found - Model Needs Improvement
              </h3>
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                <p className="text-red-700">
                  Your model did not meet the approval criteria. Please review
                  the detailed feedback below and make the necessary adjustments
                  before resubmitting.
                </p>
              </div>

              {/* QA Summary */}
              {qaResults?.summary && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                  <h4 className="font-medium text-blue-800 mb-2">
                    QA Analysis Summary
                  </h4>
                  <p className="text-blue-700">{qaResults.summary}</p>
                </div>
              )}

              {qaResults?.differences && qaResults.differences.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-800">
                    Issues to Address:
                  </h4>
                  <div className="space-y-2">
                    {qaResults.differences.map((diff, index) => (
                      <div key={index}>
                        {diff.issues.map((issue, issueIndex) => (
                          <div
                            key={issueIndex}
                            className="p-3 bg-gray-50 border-l-4 border-gray-400 rounded"
                          >
                            <p className="text-sm text-gray-700">• {issue}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Visual Comparison Section */}
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Visual Comparison</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Model Screenshots */}
                <div>
                  <h3 className="font-medium mb-3 text-gray-700">Your Model</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {screenshots.map((screenshot, index) => (
                      <div
                        key={index}
                        className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img
                          src={screenshot}
                          alt={`Your model ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reference Images */}
                <div>
                  <h3 className="font-medium mb-3 text-gray-700">
                    Reference Images
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {referenceImages.slice(0, 4).map((refImage, index) => (
                      <div
                        key={index}
                        className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img
                          src={refImage}
                          alt={`Reference ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-t border-gray-200" />

            {/* Technical Analysis Section */}
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Technical Analysis</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Worktest Requirements */}
                <div>
                  <h3 className="font-medium mb-3 text-gray-700">
                    Worktest Requirements
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Max Triangles</span>
                      <span className="text-sm font-mono">
                        {currentSpecs.maxTriangles.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Max Materials</span>
                      <span className="text-sm font-mono">
                        {currentSpecs.maxMaterials}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Max File Size</span>
                      <span className="text-sm font-mono">
                        {currentSpecs.maxFileSize}MB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Model Statistics */}
                <div>
                  <h3 className="font-medium mb-3 text-gray-700">
                    Your Model Stats
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      {modelStats?.triangles &&
                      modelStats.triangles <= currentSpecs.maxTriangles ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-green-100 text-green-800 rounded-full text-xs">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-red-100 text-red-800 rounded-full text-xs">
                          ✗
                        </span>
                      )}
                      <span className="text-sm">
                        Triangles:{" "}
                        {modelStats?.triangles?.toLocaleString() || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center">
                      {modelStats?.materialCount &&
                      modelStats.materialCount <= currentSpecs.maxMaterials ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-green-100 text-green-800 rounded-full text-xs">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-red-100 text-red-800 rounded-full text-xs">
                          ✗
                        </span>
                      )}
                      <span className="text-sm">
                        Materials: {modelStats?.materialCount || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center">
                      {glbFile &&
                      glbFile.size / (1024 * 1024) <=
                        currentSpecs.maxFileSize ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-green-100 text-green-800 rounded-full text-xs">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-red-100 text-red-800 rounded-full text-xs">
                          ✗
                        </span>
                      )}
                      <span className="text-sm">
                        File Size:{" "}
                        {glbFile
                          ? `${(glbFile.size / (1024 * 1024)).toFixed(2)}MB`
                          : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center">
                      {modelStats?.doubleSidedCount === 0 ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-green-100 text-green-800 rounded-full text-xs">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-red-100 text-red-800 rounded-full text-xs">
                          ✗
                        </span>
                      )}
                      <span className="text-sm">
                        Double-sided Materials:{" "}
                        {modelStats?.doubleSidedCount || "0"}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-gray-100 text-gray-800 rounded-full text-xs">
                        i
                      </span>
                      <span className="text-sm">
                        Mesh Count: {modelStats?.meshCount || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <span className="inline-flex items-center justify-center w-5 h-5 mr-3 bg-gray-100 text-gray-800 rounded-full text-xs">
                        i
                      </span>
                      <span className="text-sm">
                        Vertices:{" "}
                        {modelStats?.vertices?.toLocaleString() || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4 mb-6">
            {/* Improvement Message for Non-Approved Models */}
            <div className="bg-red-50 p-6 rounded-lg border border-red-200">
              <h3 className="text-lg font-semibold text-red-800 mb-2">
                Model Requires Improvements
              </h3>
              <p className="text-red-700">
                Please review the issues listed above and make the necessary
                adjustments to your 3D model. Once you've addressed these
                concerns, you can upload your improved model for re-evaluation.
              </p>
            </div>

            <button
              onClick={resetAll}
              className="w-full border border-gray-300 text-gray-800 rounded-lg py-4 font-medium hover:bg-gray-50 transition-colors"
            >
              Test Another Model
            </button>
          </div>

          {/* Additional Info */}
          <div className="mt-6 p-4 rounded-lg bg-blue-50">
            <h3 className="font-semibold mb-2 text-blue-900">Next Steps</h3>
            <p className="text-sm text-blue-800">
              Your model has been analyzed against the {selectedDifficulty}{" "}
              worktest requirements. Review the feedback above to understand
              what needs improvement. You can test your updated model anytime.
            </p>
          </div>
        </div>
      ) : (
        // Main Form Interface
        <>
          <div className="mb-8 flex justify-center">
            <img
              src="https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png"
              alt="CharpstAR Logo"
              className="h-10"
            />
          </div>

          <h1 className="text-2xl font-bold mb-6">Worktest QA Tool</h1>

          {/* Difficulty Selection */}
          <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Select Worktest Difficulty
            </h2>
            <div className="flex gap-4 mb-4">
              {(Object.keys(WORKTEST_CONFIG) as DifficultyLevel[]).map(
                (level) => (
                  <button
                    key={level}
                    onClick={() => setSelectedDifficulty(level)}
                    className={`px-6 py-3 rounded-lg font-medium capitalize transition-colors ${
                      selectedDifficulty === level
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    {level}
                    {level === "easy" && " ⭐"}
                    {level === "medium" && " ⭐⭐"}
                    {level === "hard" && " ⭐⭐⭐"}
                  </button>
                )
              )}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">
                {currentSpecs.title}
              </h3>
              <div className="text-sm text-blue-800 space-y-1">
                <p>
                  <strong>Max Triangles:</strong>{" "}
                  {currentSpecs.maxTriangles.toLocaleString()}
                </p>
                <p>
                  <strong>Max Materials:</strong> {currentSpecs.maxMaterials}
                </p>
                <p>
                  <strong>Max File Size:</strong> {currentSpecs.maxFileSize}MB
                </p>
                <p>
                  <strong>Dimensions:</strong> {currentSpecs.dimensions}
                </p>
              </div>
            </div>
          </div>

          {/* Reference Images Display */}
          <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Reference Images ({selectedDifficulty} difficulty)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {referenceImages.map((imageUrl, index) => (
                <div
                  key={index}
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                >
                  <img
                    src={imageUrl}
                    alt={`Reference ${index + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                    onClick={() => window.open(imageUrl, "_blank")}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Click on any image to view full size. These are the official
              reference images your model will be compared against.
            </p>
          </div>

          {/* GLB Upload */}
          <div className="mb-6 bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Upload Your GLB Model
            </h2>
            <div
              onDragEnter={prevent}
              onDragOver={prevent}
              onDrop={handleGlbDrop}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center hover:border-gray-400 transition-colors"
            >
              {glbFile ? (
                <div className="text-center">
                  <div className="mb-2">
                    <svg
                      className="w-12 h-12 mx-auto text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                  </div>
                  <p className="font-medium text-gray-900">{glbFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(glbFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  <button
                    onClick={resetAll}
                    className="mt-2 text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    Remove and upload different file
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 text-gray-400">
                    <svg
                      className="w-16 h-16 mx-auto"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      ></path>
                    </svg>
                  </div>
                  <p className="mb-2 text-lg text-center font-medium">
                    Drop your GLB file here
                  </p>
                  <p className="mb-4 text-sm text-gray-500 text-center">or</p>
                  <label className="cursor-pointer">
                    <span className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                      Browse Files
                    </span>
                    <input
                      type="file"
                      accept=".glb"
                      hidden
                      onChange={handleFileSelect}
                    />
                  </label>
                  <p className="mt-4 text-xs text-gray-500 text-center">
                    Only .glb files are accepted
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Screenshots */}
          {screenshots.length > 0 && (
            <div className="mb-6 bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Generated Screenshots
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {screenshots.map((screenshot, index) => (
                  <div
                    key={index}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                  >
                    <img
                      src={screenshot}
                      alt={`Screenshot ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error and status messages */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}
          {statusMessage && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-600">{statusMessage}</p>
            </div>
          )}

          {/* Run QA button */}
          <button
            onClick={handleRunQA}
            disabled={isProcessing || screenshots.length !== 4}
            className="w-full p-4 bg-green-600 text-white rounded-lg font-medium text-lg disabled:opacity-50 disabled:bg-gray-400 hover:bg-green-700 transition-colors"
          >
            {isProcessing
              ? "Processing..."
              : `Run QA for ${
                  selectedDifficulty.charAt(0).toUpperCase() +
                  selectedDifficulty.slice(1)
                } Worktest`}
          </button>

          {/* Instructions */}
          <div className="mt-6 bg-gray-100 p-6 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-3">How it works:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              <li>
                Select your worktest difficulty level (Easy, Medium, or Hard)
              </li>
              <li>Upload your GLB model file</li>
              <li>
                The tool will automatically capture 4 screenshots from different
                angles
              </li>
              <li>
                Your model will be compared against the official reference
                images
              </li>
              <li>
                Receive detailed feedback and verification for human review
              </li>
            </ol>
          </div>

          {/* Hidden model-viewer */}
          {glbPreviewUrl && viewerReady && (
            <model-viewer
              ref={(el) => (viewerRef.current = el as ModelViewerElement)}
              src={glbPreviewUrl}
              loading="eager"
              exposure="1.3"
              environment-image="https://cdn.charpstar.net/Demos/warm.hdr"
              camera-orbit="0deg 75deg 150%"
              disable-zoom
              interaction-prompt="none"
              style={{
                width: 1024,
                height: 1024,
                position: "absolute",
                top: 0,
                left: 0,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
