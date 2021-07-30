const input = document.querySelector('#video-url');
const form = document.querySelector('#video-form');
const output = document.querySelector('#video-output');

form.addEventListener('submit', async e => {
  console.log('SUBMITTED');
  e.preventDefault();

  if (!input.value) return;

  const captionsUrl = `http://localhost:3000/captions?url=${encodeURIComponent(
    input.value
  )}`;
  const video = document.createElement('video');

  video.src = input.value;
  video.controls = true;
  // video.crossOrigin = true;

  const track = document.createElement('track');

  track.default = true;
  track.srclang = 'en';
  track.kind = 'captions';
  track.src = captionsUrl;

  video.appendChild(track);

  [...output.children].forEach(child => child.remove());

  output.appendChild(video);
});
