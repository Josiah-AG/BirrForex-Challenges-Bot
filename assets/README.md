# Assets Directory

This directory contains media files used by the bot.

## Weekly Challenges Banner

**File:** `weekly_challenges_banner.jpg`

**Usage:** This image is sent with the morning post on the main channel at 10:00 AM on challenge days (Wednesday & Sunday).

**Instructions:**
1. Save the "Weekly Challenges" banner image as `weekly_challenges_banner.jpg` in this directory
2. The image should be in JPG format
3. Recommended dimensions: 1200x400 pixels (or similar banner aspect ratio)
4. The bot will automatically include this image with the morning post

**Fallback:** If the image file is not found, the bot will send the text-only version of the post.

## Adding the Image

To add the banner image:

```bash
# From the project root directory
cp /path/to/your/banner.jpg "BirrForex Challenges Bot/assets/weekly_challenges_banner.jpg"
```

Or simply drag and drop the image file into this directory and rename it to `weekly_challenges_banner.jpg`.
