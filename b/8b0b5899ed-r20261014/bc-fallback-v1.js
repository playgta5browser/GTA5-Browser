// CPU upload decoder for WebGPU adapters without desktop BC texture support.
(function(scope) {
  function blockBytes(format) { return /^bc[14]-/.test(format) ? 8 : 16; }
  function color565(value) { return [((value >> 11) & 31) * 255 / 31, ((value >> 5) & 63) * 255 / 63, (value & 31) * 255 / 31].map(Math.round); }
  function decodeColors(source, offset, output, opaque) {
    const a = source[offset] | source[offset + 1] << 8, b = source[offset + 2] | source[offset + 3] << 8;
    const c0 = color565(a), c1 = color565(b), colors = [[...c0,255],[...c1,255]];
    if (opaque || a > b) {
      colors.push(c0.map((v,i)=>Math.floor((2*v+c1[i])/3)).concat(255),c0.map((v,i)=>Math.floor((v+2*c1[i])/3)).concat(255));
    } else colors.push(c0.map((v,i)=>Math.floor((v+c1[i])/2)).concat(255),[0,0,0,0]);
    for (let i = 0; i < 16; i++) output.set(colors[(source[offset + 4 + (i >> 2)] >> ((i & 3)*2)) & 3],i*4);
  }
  function decodeAlpha(source, offset, output, channel) {
    const a = source[offset], b = source[offset + 1], values = [a,b];
    if (a > b) for (let i = 1; i <= 6; i++) values.push(Math.floor(((7-i)*a+i*b)/7));
    else { for (let i = 1; i <= 4; i++) values.push(Math.floor(((5-i)*a+i*b)/5)); values.push(0,255); }
    for (let i = 0; i < 16; i++) {
      const bit = i*3, byte = offset + 2 + (bit >> 3), shift = bit & 7;
      const index = ((source[byte] | (source[byte+1] || 0) << 8) >> shift) & 7;
      output[i*4+channel] = values[index];
    }
  }
  function decode(format, source, width, height, bytesPerRow = 0, rowsPerImage = 0, depth = 1) {
    const bytes = blockBytes(format), bx = Math.ceil(width/4), by = Math.ceil(height/4), row = bx*bytes;
    bytesPerRow ||= row; rowsPerImage ||= by;
    const isHalf = format.startsWith('bc6'), pixelBytes = isHalf ? 8 : 4;
    const output = new Uint8Array(width*height*depth*pixelBytes);
    for (let layer = 0; layer < depth; layer++) {
      const packed = new Uint8Array(row*by), layerOffset = layer*bytesPerRow*rowsPerImage;
      for (let y = 0; y < by; y++) packed.set(source.subarray(layerOffset+y*bytesPerRow,layerOffset+y*bytesPerRow+row),y*row);
      let pixels;
      if (isHalf) pixels = scope.GtaBCAdvanced.bc6(packed,width,height);
      else if (format.startsWith('bc7')) pixels = scope.GtaBCAdvanced.bc7(packed,width,height);
      else {
        pixels = new Uint8Array(width*height*4);
        const block = new Uint8Array(64);
        for (let yb = 0; yb < by; yb++) for (let xb = 0; xb < bx; xb++) {
          const offset = (yb*bx+xb)*bytes;
          block.fill(0); for (let i=3;i<64;i+=4) block[i]=255;
          if (format.startsWith('bc1')) decodeColors(packed,offset,block,false);
          else if (format.startsWith('bc2')) {
            decodeColors(packed,offset+8,block,true);
            for (let i=0;i<16;i++) block[i*4+3]=((packed[offset+(i>>1)]>>((i&1)*4))&15)*17;
          } else if (format.startsWith('bc3')) { decodeColors(packed,offset+8,block,true); decodeAlpha(packed,offset,block,3); }
          else { decodeAlpha(packed,offset,block,0); if(format.startsWith('bc5'))decodeAlpha(packed,offset+8,block,1); }
          for (let y=0;y<4&&yb*4+y<height;y++) for(let x=0;x<4&&xb*4+x<width;x++) pixels.set(block.subarray((y*4+x)*4,(y*4+x+1)*4),((yb*4+y)*width+xb*4+x)*4);
        }
      }
      output.set(pixels,layer*width*height*pixelBytes);
    }
    return { data:output, bytesPerRow:width*pixelBytes, rowsPerImage:height };
  }
  function format(format) { return format.startsWith('bc6') ? 'rgba16float' : format.endsWith('-srgb') ? 'rgba8unorm-srgb' : 'rgba8unorm'; }
  scope.GtaBCFallback = { decode, format, blockBytes };
})(typeof self !== 'undefined' ? self : globalThis);
