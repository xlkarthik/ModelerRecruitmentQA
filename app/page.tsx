"use client";

import WorktestQA from "@/components/WorktestQA";
import {
  SOFA_REFERENCE_IMAGES,
  SOFA_WORKTEST_CONFIG,
} from "@/lib/worktestConfig";

export default function Page() {
  return (
    <WorktestQA
      worktestConfig={SOFA_WORKTEST_CONFIG}
      referenceImages={SOFA_REFERENCE_IMAGES}
      variantTitle="Sofa"
    />
  );
}
