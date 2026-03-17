// scripts/qa-worker.ts
import "dotenv/config";
import { dequeueJob } from "../lib/queue";
import { setJobStatus, setJobResult, setJobError } from "../lib/store";
import { Configuration, OpenAIApi } from "openai-edge";

// Worker to continuously process QA jobs from the queue
async function handleJob() {
  const job = dequeueJob();
  if (!job) return; // no jobs to process

  const { jobId, images } = job;
  setJobStatus(jobId, "PROCESSING");

  try {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    const openai = new OpenAIApi(configuration);

    // Build chat prompt with images embedded
    const messages: any[] = [
      {
        role: "system",
        content:
          "You are a 3D QA specialist. Compare the live screenshots to the reference images and output only JSON with differences.",
      },
    ];
    // Add the 4 live screenshots
    for (let i = 0; i < 4; i++) {
      messages.push({
        role: "user",
        content: `Live screenshot ${i + 1}:\n${images[i]}`,
      });
    }
    // Add the 4 reference images
    for (let i = 4; i < 8; i++) {
      messages.push({
        role: "user",
        content: `Reference image ${i - 3}:\n${images[i]}`,
      });
    }

    // Call GPT-4 Vision for QA comparison
    const resp = await openai.createChatCompletion({
      model: "gpt-4-vision-preview",
      messages,
      temperature: 0,
    });

    // The response is a JSON string describing differences
    const text = await resp.text();
    const report = JSON.parse(text);

    setJobResult(jobId, report);
  } catch (err: any) {
    console.error(`Job ${jobId} failed:`, err);
    setJobError(jobId, err.message || "Unknown error");
  }
}

// Poll the queue every second
setInterval(handleJob, 1000);
