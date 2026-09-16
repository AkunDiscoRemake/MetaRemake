using System;
using System.Text;
using UnityEngine;

namespace LuaJITMR.Stereo
{
    /// <summary>
    /// Parses Google Cardboard viewer profile URIs (the QR code format) and produces a <see cref="LensProfile"/>.
    /// Format: <c>http://google.com/cardboard/cfg?p=<base64url-encoded protobuf></c>
    ///
    /// We avoid the full protobuf by parsing the known fixed wire layout of a DeviceProfile:
    ///   string vendor   (field 1, wire LEN)
    ///   string model    (field 2, wire LEN)
    ///   float screen_to_lens_distance (field 3, wire 32-bit)
    ///   float inter_lens_distance     (field 4, wire 32-bit)
    ///   float tray_to_lens_distance   (field 6, wire 32-bit)
    ///   float vertical_alignment_offset (field 10, wire 32-bit, added in v2)
    ///   repeated float distortion_coefficients (field 5, packed floats)
    ///   float left_eye_field_of_view_angles  (field 7) — 4 floats: left,right,bottom,top
    ///
    /// Only fields 3..5 and 7 are strictly needed for rendering; vendor/model are cosmetic.
    /// Reference: https://github.com/googlevr/gvr-android-sdk/blob/master/proto/cardboard_device.proto
    /// </summary>
    public static class CardboardProfileQR
    {
        private const string Prefix = "http://google.com/cardboard/cfg?p=";
        private const string HttpsPrefix = "https://google.com/cardboard/cfg?p=";

        /// <summary>
        /// Parses a Cardboard QR URI string and writes the result into <paramref name="profile"/>.
        /// Returns true on success, false if the URI is malformed.
        /// </summary>
        public static bool TryParse(Uri uri, out LensProfile profile)
        {
            profile = null;
            if (uri == null) return false;
            string s = uri.ToString();
            int idx = s.IndexOf("?p=", StringComparison.Ordinal);
            if (idx < 0) return false;
            string b64 = s.Substring(idx + 3);
            return TryParseBase64(b64, out profile);
        }

        public static bool TryParse(string uri, out LensProfile profile)
        {
            if (string.IsNullOrEmpty(uri)) { profile = null; return false; }
            if (Uri.TryCreate(uri, UriKind.Absolute, out var u)) return TryParse(u, out profile);
            if (uri.StartsWith(Prefix) || uri.StartsWith(HttpsPrefix))
            {
                // Allow raw strings without going through Uri
                int iq = uri.IndexOf("?p=", StringComparison.Ordinal);
                string b64 = uri.Substring(iq + 3);
                return TryParseBase64(b64, out profile);
            }
            profile = null;
            return false;
        }

        private static bool TryParseBase64(string b64url, out LensProfile profile)
        {
            profile = ScriptableObject.CreateInstance<LensProfile>();
            try
            {
                byte[] bytes = Base64UrlDecode(b64url);
                if (bytes == null || bytes.Length < 20) return false;

                float screenToLens = 0.037f;
                float interLens = 0.063f;
                float trayToLens = 0.01f;
                float vAlign = 0f;
                float[] dist = null;
                float[] fov = null;
                string vendor = "Cardboard";
                string model = "Unknown";

                int pos = 0;
                while (pos < bytes.Length)
                {
                    if (!ReadVarint(bytes, ref pos, out uint tag)) break;
                    int field = (int)(tag >> 3);
                    int wire = (int)(tag & 0x7);
                    switch (field)
                    {
                        case 1: vendor = ReadString(bytes, ref pos); break;
                        case 2: model = ReadString(bytes, ref pos); break;
                        case 3: screenToLens = ReadFloat(bytes, ref pos); break;
                        case 4: interLens = ReadFloat(bytes, ref pos); break;
                        case 6: trayToLens = ReadFloat(bytes, ref pos); break;
                        case 10: vAlign = ReadFloat(bytes, ref pos); break;
                        case 5: dist = ReadPackedFloats(bytes, ref pos, wire); break;
                        case 7: fov = ReadPackedFloats(bytes, ref pos, wire); break;
                        case 8: // has_magnet — legacy bool
                            if (wire == 0) ReadVarint(bytes, ref pos, out _);
                            else Skip(bytes, ref pos, wire);
                            break;
                        case 9: // primary button (enum) — skip
                            Skip(bytes, ref pos, wire);
                            break;
                        default:
                            Skip(bytes, ref pos, wire);
                            break;
                    }
                }

                profile.vendor = vendor;
                profile.viewerName = model;
                profile.screenToLensDistanceM = screenToLens;
                profile.lensCenterOffsetM = interLens * 0.5f;
                profile.trayToLensDistanceM = trayToLens;
                profile.verticalAlignmentOffsetM = vAlign;

                if (dist != null && dist.Length >= 2)
                {
                    // Coefficients are k1, k2 (inverse convention sometimes includes k3). Use first two.
                    profile.distortionK1K2 = new Vector2(dist[0], dist[1]);
                }

                if (fov != null && fov.Length >= 4)
                {
                    // Angles in degrees: left, right, bottom, top
                    float left = fov[0], right = fov[1], bottom = fov[2], top = fov[3];
                    profile.horizontalFovDeg = left + right;
                    profile.verticalFovDeg = bottom + top;
                }

                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[LuaJITMR] Failed to parse Cardboard QR: {e.Message}");
                return false;
            }
        }

        private static byte[] Base64UrlDecode(string s)
        {
            var sb = new StringBuilder(s);
            sb.Replace('-', '+');
            sb.Replace('_', '/');
            int pad = (sb.Length % 4);
            if (pad == 2) sb.Append("==");
            else if (pad == 3) sb.Append("=");
            try { return Convert.FromBase64String(sb.ToString()); }
            catch { return null; }
        }

        private static bool ReadVarint(byte[] b, ref int pos, out uint v)
        {
            v = 0; int shift = 0;
            while (pos < b.Length)
            {
                byte cur = b[pos++];
                v |= (uint)(cur & 0x7F) << shift;
                if ((cur & 0x80) == 0) return true;
                shift += 7;
                if (shift > 28) return false;
            }
            return false;
        }

        private static float ReadFloat(byte[] b, ref int pos)
        {
            // wire type 5 = fixed 32 bits, little endian
            if (pos + 4 > b.Length) return 0f;
            uint bits = b[pos] | (uint)b[pos + 1] << 8 | (uint)b[pos + 2] << 16 | (uint)b[pos + 3] << 24;
            pos += 4;
            return BitConverter.ToSingle(BitConverter.GetBytes(bits), 0);
        }

        private static string ReadString(byte[] b, ref int pos)
        {
            if (!ReadVarint(b, ref pos, out uint len)) return string.Empty;
            int l = (int)len;
            if (pos + l > b.Length) return string.Empty;
            string s = Encoding.UTF8.GetString(b, pos, l);
            pos += l;
            return s;
        }

        private static float[] ReadPackedFloats(byte[] b, ref int pos, int wire)
        {
            if (wire == 5)
            {
                // single float, not packed
                return new[] { ReadFloat(b, ref pos) };
            }
            if (wire != 2) return null;
            if (!ReadVarint(b, ref pos, out uint len)) return null;
            int end = pos + (int)len;
            int n = (int)len / 4;
            var arr = new float[n];
            for (int i = 0; i < n && pos + 4 <= end; i++) arr[i] = ReadFloat(b, ref pos);
            pos = end;
            return arr;
        }

        private static void Skip(byte[] b, ref int pos, int wire)
        {
            switch (wire)
            {
                case 0: ReadVarint(b, ref pos, out _); break;   // varint
                case 1: pos += 8; break;                        // 64-bit
                case 5: pos += 4; break;                        // 32-bit
                case 2:                                        // length-delimited
                    if (ReadVarint(b, ref pos, out uint len)) pos += (int)len;
                    break;
            }
        }
    }
}
