// API input for a crew's optional features: every key, as a boolean.
import { z } from "zod";
import type { FeatureKey } from "@/lib/features";

export const FeaturesBody = z.object({
  pullUpNow: z.boolean(),
  fairMeetup: z.boolean(),
  secretRoles: z.boolean(),
  photoBingo: z.boolean(),
} satisfies Record<FeatureKey, z.ZodBoolean>);
