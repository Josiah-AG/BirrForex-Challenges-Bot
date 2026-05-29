# Favicon Requirements for WinnerPip

## Exact Dimensions Needed

Please provide a favicon with these specifications:

### Primary Favicon (ICO format - recommended)
- **Format:** .ICO file
- **Dimensions:** Multi-size ICO containing:
  - 16×16 pixels
  - 32×32 pixels
  - 48×48 pixels
- **File name:** `favicon.ico`
- **Color mode:** RGB
- **Background:** Transparent or solid color
- **Content:** WinnerPip icon logo (simplified if needed for small sizes)

### Alternative: PNG Favicons (if ICO not available)
If you can't provide ICO, please provide these PNG files:

1. **favicon-16x16.png**
   - Size: 16×16 pixels
   - Format: PNG with transparency

2. **favicon-32x32.png**
   - Size: 32×32 pixels
   - Format: PNG with transparency

3. **apple-touch-icon.png**
   - Size: 180×180 pixels
   - Format: PNG
   - For iOS home screen

### Design Guidelines

For best results at small sizes (16×16, 32×32):
- Use simplified version of the icon if needed
- Ensure good contrast
- Avoid fine details that won't be visible
- Test at actual size to ensure clarity

### Current Temporary Solution

We're currently using `winnerpip-icon.png` (87KB, large size) as favicon.
Browsers will auto-scale it, but a proper multi-size ICO file will:
- Load faster
- Look sharper at all sizes
- Work better across all browsers

## Where to Place

Once you provide the favicon file(s), place them in:
- `winnerpip/public/favicon.ico` (or the PNG files)

I'll update the app to use them properly.
