/**
 * Zentra XR - JavaScript layer.
 *
 * Kotlin owns the renderer, the sensors and the Android integration; this script owns
 * the small pieces of logic that are nicer expressed as data: date/clock formatting,
 * Web App metadata and the scripted showcase lines of VR Demo.
 */
(function (global) {
  'use strict';

  var LINES = [
    'Zentra XR • plataforma Cardboard VR completa',
    'Smartphone + VR Box + SBS + 3DoF + Direct Touch',
    'A câmera só existe para ver suas mãos',
    'Sem OpenXR, sem 6DoF, sem SLAM • só Cardboard',
    'Hand tracking: One Euro + Kalman em tempo real'
  ];

  var Zentra = {
    version: '1.0.0',

    /** Formats the current time of a timezone, e.g. "14:05". */
    zoneTime: function (tz) {
      try {
        return new Intl.DateTimeFormat('pt-BR', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date());
      } catch (e) {
        return '--:--';
      }
    },

    /** Long date used by the VR Clock. */
    longDate: function (locale) {
      try {
        return new Intl.DateTimeFormat(locale || 'pt-BR', {
          weekday: 'long', day: 'numeric', month: 'long'
        }).format(new Date());
      } catch (e) {
        return '';
      }
    },

    /** Picks a friendly name for a Web App from a page title and url. */
    suggestName: function (title, url) {
      var name = (title || '').trim();
      if (name.length > 28) name = name.slice(0, 28).trim() + '…';
      if (!name) {
        try {
          name = new URL(url).hostname.replace(/^www\./, '');
        } catch (e) {
          name = 'Web App';
        }
      }
      return name;
    },

    /** Rotating showcase line shown by VR Demo. */
    demoLine: function (fps, thermal) {
      var i = Math.floor(Date.now() / 6000) % LINES.length;
      var heat = thermal >= 2 ? ' • otimização térmica ativa' : '';
      return LINES[i] + ' • ' + fps + ' fps' + heat;
    },

    /** Palette tokens shared with any 2D surface that needs the same colours. */
    themeTokens: function (light) {
      return light
        ? { bg: '#F4F6F9', surface: '#FFFFFF', text: '#0A0C11', dim: '#5C6470', border: 'rgba(0,0,0,0.12)' }
        : { bg: '#05070C', surface: '#14181F', text: '#FFFFFF', dim: '#9EA7B4', border: 'rgba(255,255,255,0.12)' };
    }
  };

  global.Zentra = Zentra;
})(typeof globalThis !== 'undefined' ? globalThis : this);
