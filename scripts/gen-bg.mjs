import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const wallpapers = [
  { name: 'aurora', prompt: 'Vivid aurora borealis over snowy mountains at night, green purple teal glowing sky, high contrast, colorful stars, photographic, detailed' },
  { name: 'fluid', prompt: 'Abstract colorful fluid art with vibrant orange pink and teal liquid blobs swirling, glossy gradient mesh background, high saturation, smooth, 4k wallpaper' },
  { name: 'sunset', prompt: 'Tropical beach at golden sunset, palm leaves silhouette, warm orange and magenta sky over turquoise sea, photographic, vibrant' },
  { name: 'neoncity', prompt: 'Futuristic neon city street at night, colorful bokeh lights, rain reflections, cyberpunk magenta and cyan glow, photographic' },
];

async function main() {
  const zai = await ZAI.create();
  for (const w of wallpapers) {
    const out = `/home/z/my-project/public/backgrounds/${w.name}.png`;
    if (fs.existsSync(out)) { console.log('skip', w.name); continue; }
    try {
      const res = await zai.images.generations.create({ prompt: w.prompt, size: '1440x736' });
      fs.writeFileSync(out, Buffer.from(res.data[0].base64, 'base64'));
      console.log('OK', w.name);
    } catch (e) {
      console.error('FAIL', w.name, e.message?.slice(0, 120));
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}
main();
