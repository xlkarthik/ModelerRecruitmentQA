<<<<<<< HEAD
# 3D QA Comparator

**3D QA Comparator** automates visual quality assurance for 3D renders by comparing them against real-world reference images. It produces side-by-side annotated output highlighting discrepancies (materials, proportions, textures) and generates actionable improvement suggestions.

---

## Features

- **Image Comparison**: Upload or link render and reference images.
- **AI-Driven Analysis**: Uses OpenAI’s vision models to detect differences.
- **Annotation Pipeline**: Python/Pillow script draws bounding boxes and labels.
- **JSON Output**: Gets structured `differences` and `suggestions` for further processing.
- **Web Interface**: Built with Next.js for quick uploads and results display.

---

## Installation

1. Clone the repo:

   ```bash
   git clone https://github.com/YOUR_USERNAME/3d-qa-comparator.git
   cd 3d-qa-comparator/qa-app-frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment:

   - Create `.env.local` in the root:

     ```ini
     OPENAI_API_KEY=your_api_key
     STORAGE_PATH=/tmp/uploads
     ```

---

## Python Annotation Setup

1. Navigate to `annotations/`:

   ```bash
   cd annotations
   ```

2. Create and activate a virtual environment:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install requirements:

   ```bash
   python -m pip install pillow
   ```

4. Deactivate when done:

   ```bash
   deactivate
   ```

---

## Running the App

```bash
# From project root
cd qa-app-frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser, provide two image URLs (or uploads), and click **Compare**.

---

## Usage

- **Compare by URL**: Paste public image links into the form.
- **Compare by Upload (Pages Router)**: Switch to `/api/compare` endpoint if using file uploads.

---

## LICENSE

**All Rights Reserved**

# This project is proprietary. No reuse, distribution, or modification is permitted without explicit permission.

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

> > > > > > > e45b2a0 (Initial commit)
=======
# ModelerRecruitmentQA
3D QA Comparator automates visual QA for 3D Models: upload or link your 3D model, then get a side-by-side annotated comparison highlighting discrepancies (materials, proportions, textures) plus actionable suggestions. Built with Next.js, OpenAI Vision, and a Python/Pillow annotation pipeline.
>>>>>>> 01c7e3da0352bf6eb81c59070969371edb7de9e8
