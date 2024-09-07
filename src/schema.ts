import { z } from "zod";

export const specialOrderSchema = z.object({
  customerName: z.string(),
  status: z
    .enum(["Pending", "Processing", "Completed"], {
      invalid_type_error:
        "Status must be 'Pending', 'Processing', or 'Completed'",
      required_error: "Status is required",
    })
    .optional(),
  fulfillmentDate: z.date({
    invalid_type_error: "Fulfillment date must be a date",
    required_error: "Fulfillment date is required",
  }),
  notes: z.string().nullable(),
  items: z.array(
    z.object({
      productName: z
        .string()
        .min(1, { message: "Product name cannot be empty" })
        .max(255),
      description: z.string().max(1000).nullable(),
      quantity: z.coerce.number().positive(),
      status: z.enum(["Pending", "InProgress", "Fulfilled", "Cancelled"]),
      isUrgent: z.boolean(),
    })
  ),
});

export type SpecialOrder = z.infer<typeof specialOrderSchema>;
