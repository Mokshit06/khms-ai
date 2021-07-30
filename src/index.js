const express = require('express');
const { SpeechClient } = require('@google-cloud/speech');
const axios = require('axios').default;
const ffmpeg = require('fluent-ffmpeg');
const { Writable } = require('stream');
const dotenv = require('dotenv-flow');

dotenv.config();

const app = express();

const client = new SpeechClient({
  credentials: {
    type: 'service_account',
    private_key: process.env.GOOGLE_PRIVATE_KEY,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
  },
});

async function convertToAudio(readbleStream, writableStream) {
  return new Promise((resolve, reject) => {
    ffmpeg(readbleStream)
      .setDuration(10)
      .audioChannels(1)
      .format('flac')
      .on('end', () => {
        resolve(null);
      })
      .on('error', err => {
        reject(err);
      })
      .pipe(writableStream);
  });
}

class AudioWritableStream extends Writable {
  #body = [];

  _write(chunk, encoding, callback) {
    this.#body.push(chunk);
    callback();
  }

  get body() {
    const chunks = [];

    for (const chunk of this.#body) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(String(chunk)));
      }
    }

    return Buffer.concat(chunks);
  }
}

function format(seconds) {
  const secondsNum = Number(seconds);
  const hours = Math.floor(secondsNum / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor(secondsNum / 60)
    .toString()
    .padStart(2, '0');
  const sec = Math.floor(secondsNum % 60)
    .toString()
    .padStart(2, '0');
  const ms = seconds.substr(-1);

  return `${hours}:${minutes}:${sec}.${ms}00`;
}

function generateWebVTT(response) {
  const result = response.results[0].alternatives[0];
  let text = `WEBVTT\n\n`;
  let currentStringArr = [];
  let currentTime;
  let currentEnd;

  if (!result.words) return text;

  for (const wordInfo of result.words) {
    const startMs = wordInfo.startTime.nanos / 100_000_000;
    const endMs = wordInfo.endTime.nanos / 100_000_000;
    const startSeconds = `${wordInfo.startTime.seconds}.${startMs}`;
    const endSeconds = `${wordInfo.endTime.seconds}.${endMs}`;

    if (typeof currentTime === 'undefined') {
      currentTime = startSeconds;
    }

    if (Number(startSeconds) <= Number(currentTime) + 3) {
      currentStringArr.push(wordInfo.word);
    } else {
      text += `${format(currentTime)} --> ${format(
        currentEnd
      )}\n- ${currentStringArr.join(' ')}\n\n`;

      currentStringArr = [wordInfo.word];
      currentTime = startSeconds;
    }

    currentEnd = endSeconds;
  }

  text += `${format(currentTime)} --> ${format(
    currentEnd
  )}\n- ${currentStringArr.join(' ')}\n\n`;

  return text;
}

app.use(express.static('public'));

app.get('/captions', async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).send('`url` query param is required');
  }

  try {
    const { data: videoStream } = await axios.get(url, {
      responseType: 'stream',
    });

    const audioStream = new AudioWritableStream();
    await convertToAudio(videoStream, audioStream);
    const audioBuffer = audioStream.body;

    const request = {
      config: {
        encoding: 'FLAC',
        languageCode: 'en-US',
        enableWordTimeOffsets: true,
        model: 'video',
      },
      audio: {
        content: audioBuffer.toString('base64'),
      },
    };

    const [response] = await client.recognize(request);
    const captions = generateWebVTT(response);

    res.send(captions);
  } catch (error) {
    console.error(error);
    res.status(500).send(`Something went wrong\n${error}`);
  }
});

const port = 3000;

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
