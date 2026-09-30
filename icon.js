'use strict';
(function () {
  function readDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error('图片读取失败，请重新选择文件'));
      reader.readAsDataURL(blob);
    });
  }
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(Error('无法读取图片，请选择 JPG、PNG、WebP、GIF 或 ICO')); };
      image.src = url;
    });
  }
  function pngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('图片转换失败，请换一张图片重试')), 'image/png');
    });
  }
  async function prepareIcon(file, platform) {
    if (!file) throw Error('请先选择图标图片');
    if (file.size > 10 * 1024 * 1024) throw Error('原始图标图片不能超过 10 MB');
    if (!['windows', 'android'].includes(platform)) throw Error('未知的客户端平台');
    const image = await loadImage(file);
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 40000000) throw Error('图片尺寸过大，请使用不超过 4000 万像素的图片');
    const size = platform === 'windows' ? 256 : 512;
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw Error('浏览器无法处理图片，请使用新版 Chrome 或 Edge');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    const square = Math.min(width, height);
    context.drawImage(image, (width - square) / 2, (height - square) / 2, square, square, 0, 0, size, size);
    let png = await pngBlob(canvas);
    if (png.size > 1024 * 1024 && platform === 'android') {
      const smaller = document.createElement('canvas'); smaller.width = 384; smaller.height = 384;
      smaller.getContext('2d').drawImage(canvas, 0, 0, 384, 384);
      png = await pngBlob(smaller);
    }
    const preview = await readDataURL(png);
    let output = png;
    if (platform === 'windows') {
      // A Windows ICO directory entry points to an embedded 256px PNG image.
      const imageBytes = new Uint8Array(await png.arrayBuffer());
      const bytes = new Uint8Array(22 + imageBytes.length);
      const view = new DataView(bytes.buffer);
      view.setUint16(2, 1, true); view.setUint16(4, 1, true);
      view.setUint16(10, 1, true); view.setUint16(12, 32, true);
      view.setUint32(14, imageBytes.length, true); view.setUint32(18, 22, true);
      bytes.set(imageBytes, 22);
      output = new Blob([bytes], { type: 'image/x-icon' });
    }
    if (output.size > 1024 * 1024) throw Error('转换后的图标超过 1 MB，请换一张更简单的图片');
    const dataURL = await readDataURL(output);
    return { base64: dataURL.split(',')[1], preview, blob: output };
  }
  window.prepareIcon = prepareIcon;
})();
