"use client";

import WorktestQA from "@/components/WorktestQA";
import {
  GLASSES_MESH_NAMING,
  GLASSES_REFERENCE_IMAGES,
  GLASSES_WORKTEST_CONFIG,
} from "@/lib/worktestConfig";

export default function GlassesWorktestPage() {
  return (
    <WorktestQA
      worktestConfig={GLASSES_WORKTEST_CONFIG}
      referenceImages={GLASSES_REFERENCE_IMAGES}
      variantTitle="Glasses"
      meshNaming={GLASSES_MESH_NAMING}
    />
  );
}
