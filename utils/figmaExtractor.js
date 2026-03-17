const axios = require("axios");

async function extractFigmaData(fileKey, personalAccessToken) {
  try {
    const response = await axios.get(
      `https://api.figma.com/v1/files/${fileKey}`,
      {
        headers: {
          "X-Figma-Token": personalAccessToken,
        },
      },
    );

    const document = response.data.document;

    let textContent = [];
    let colors = new Set();
    let fonts = new Set();

    function traverse(node) {
      if (node.type === "TEXT" && node.characters) {
        textContent.push(node.characters);
        if (node.style && node.style.fontFamily) {
          fonts.add(node.style.fontFamily);
        }
      }
      if (node.fills) {
        node.fills.forEach((fill) => {
          if (fill.type === "SOLID" && fill.color) {
            const r = Math.round(fill.color.r * 255);
            const g = Math.round(fill.color.g * 255);
            const b = Math.round(fill.color.b * 255);
            // Figma hex convert
            const toHex = (c) => {
              const hex = c.toString(16);
              return hex.length === 1 ? "0" + hex : hex;
            };
            colors.add(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
          }
        });
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    traverse(document);

    // Deduplicate text and filter empty strings
    const uniqueText = Array.from(new Set(textContent))
      .filter((t) => t.trim().length > 0)
      .slice(0, 150); // Get top 150 unique text elements

    return {
      name: response.data.name,
      text: uniqueText,
      colors: Array.from(colors).slice(0, 15),
      fonts: Array.from(fonts).slice(0, 5),
    };
  } catch (error) {
    console.error(
      "Figma Extractor Error:",
      error.response?.data || error.message,
    );
    throw new Error(
      "Failed to extract data from Figma. Please check URL and Token.",
    );
  }
}

function extractFileKey(url) {
  // Matches standard figma links like https://www.figma.com/file/abc123DEF/name
  // Or new design links like figma.com/design/abc123DEF/name
  const match = url.match(/(?:file|design)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

module.exports = {
  extractFigmaData,
  extractFileKey,
};
