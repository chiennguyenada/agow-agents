'use strict';
/**
 * gemini-client.js
 * Drop-in replacement for claudible-client.js — same chatComplete() interface.
 * Uses Gemini streaming API to avoid proxy timeout issues.
 *
 * Required env vars:
 *   GEMINI_API_KEY  — from Google AI Studio (aistudio.google.com)
 *   GEMINI_MODEL    — default: gemini-2.0-flash
 */

const https = require('https');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if (!API_KEY) {
  console.error('[gemini-client] ERROR: GEMINI_API_KEY is not set');
  process.exit(1);
}

/**
 * Convert Claude-style messages to Gemini format.
 * Extracts system message separately (Gemini uses systemInstruction field).
 *
 * @param {Array}  messages — [{role: 'system'|'user'|'assistant', content: string}]
 * @returns {{systemInstruction: string|null, contents: Array}}
 */
function convertMessages(messages) {
  var systemInstruction = null;
  var contents = [];

  messages.forEach(function(msg) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
    } else {
      contents.push({
        role:  msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  });

  return { systemInstruction: systemInstruction, contents: contents };
}

/**
 * Call Gemini streaming API and return the full assembled text.
 * Streaming keeps the connection alive — no proxy timeout.
 *
 * @param {Array}  messages    — [{role, content}] (Claude format)
 * @param {object} options     — {maxTokens, temperature, model}
 * @returns {Promise<string>}  — full text response
 */
function chatComplete(messages, options) {
  options = options || {};
  var model       = options.model       || MODEL;
  var maxTokens   = options.maxTokens   || 1800;
  var temperature = options.temperature !== undefined ? options.temperature : 0.3;

  var converted = convertMessages(messages);

  var requestBody = {
    contents: converted.contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature:     temperature,
    },
  };

  if (converted.systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: converted.systemInstruction }],
    };
  }

  var bodyStr = JSON.stringify(requestBody);
  var path = '/v1beta/models/' + model + ':streamGenerateContent?key=' + API_KEY + '&alt=sse';

  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: 'generativelanguage.googleapis.com',
      path:     path,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent':     'agow-seo-bot/1.0',
      },
    };

    var fullText  = '';
    var buffer    = '';
    var responded = false;

    var req = https.request(opts, function(res) {
      if (res.statusCode !== 200) {
        var errData = '';
        res.on('data', function(c) { errData += c; });
        res.on('end', function() {
          try {
            var parsed = JSON.parse(errData);
            var msg = (parsed.error && parsed.error.message) || errData.slice(0, 300);
            reject(new Error('Gemini API error ' + res.statusCode + ': ' + msg));
          } catch (e) {
            reject(new Error('Gemini API error ' + res.statusCode + ': ' + errData.slice(0, 300)));
          }
        });
        return;
      }

      res.on('data', function(chunk) {
        buffer += chunk.toString();
        // SSE stream: each event starts with "data: " and ends with "\n\n"
        var lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        lines.forEach(function(line) {
          line = line.trim();
          if (!line.startsWith('data:')) return;
          var jsonStr = line.slice(5).trim();
          if (jsonStr === '[DONE]') return;
          try {
            var event = JSON.parse(jsonStr);
            var candidates = event.candidates || [];
            candidates.forEach(function(candidate) {
              var parts = (candidate.content && candidate.content.parts) || [];
              parts.forEach(function(part) {
                if (part.text) fullText += part.text;
              });
            });
          } catch (e) {
            // ignore malformed SSE lines
          }
        });
      });

      res.on('end', function() {
        // Process any remaining buffer
        if (buffer.trim().startsWith('data:')) {
          var jsonStr = buffer.trim().slice(5).trim();
          try {
            var event = JSON.parse(jsonStr);
            var candidates = event.candidates || [];
            candidates.forEach(function(candidate) {
              var parts = (candidate.content && candidate.content.parts) || [];
              parts.forEach(function(part) {
                if (part.text) fullText += part.text;
              });
            });
          } catch (e) {}
        }

        responded = true;
        if (!fullText.trim()) {
          reject(new Error('Gemini returned empty response'));
        } else {
          resolve(fullText.trim());
        }
      });

      res.on('error', function(e) {
        if (!responded) reject(new Error('Gemini stream error: ' + e.message));
      });
    });

    req.on('error', function(e) {
      reject(new Error('Gemini request error: ' + e.message));
    });

    // No hard timeout — streaming keeps connection alive naturally
    // But set a generous 5-minute safety timeout
    req.setTimeout(300000, function() {
      req.destroy();
      reject(new Error('Gemini request timeout (5min)'));
    });

    req.write(bodyStr);
    req.end();
  });
}

var modelInfo = {
  model:    MODEL,
  provider: 'Google Gemini (streaming)',
};

module.exports = { chatComplete: chatComplete, modelInfo: modelInfo };
