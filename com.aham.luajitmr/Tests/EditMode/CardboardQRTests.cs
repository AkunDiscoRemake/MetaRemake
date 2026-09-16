using NUnit.Framework;
using UnityEngine;
using LuaJITMR.Stereo;

namespace LuaJITMR.Tests.EditMode
{
    /// <summary>
    /// Tests that our protobuf-free QR URI parser correctly decodes a known
    /// Google Cardboard v2 viewer profile (URL taken from public documentation).
    /// </summary>
    public class CardboardQRTests
    {
        // Test vector: the official "Cardboard v2" URI. Base64url-encoded protobuf.
        // We use a known sample from Google's GVR docs.
        private const string CardboardV2Uri =
            "https://google.com/cardboard/cfg?p=CgZHb29nbGUSEkNhcmRib2FyZCBJL08gMjAxNR2Zxov9JkZZwua0Pj02Qu0AQgUcQgFAX2BBdSAlECIQ0A";

        [Test]
        public void Parse_DefaultURI_ReturnsValidProfile()
        {
            bool ok = CardboardProfileQR.TryParse(CardboardV2Uri, out var profile);
            // Parsing must succeed (or we need to update our wire-format logic).
            Assert.IsTrue(ok, "Expected QR parsing to succeed for known Cardboard v2 URI.");
            Assert.IsNotNull(profile);
            Assert.IsFalse(string.IsNullOrEmpty(profile.viewerName));
            Assert.IsTrue(profile.screenToLensDistanceM > 0.02f && profile.screenToLensDistanceM < 0.08f,
                $"screen-to-lens out of expected range: {profile.screenToLensDistanceM}");
            Assert.IsTrue(profile.lensCenterOffsetM > 0.02f && profile.lensCenterOffsetM < 0.04f,
                $"lens center offset out of range: {profile.lensCenterOffsetM}");
        }

        [Test]
        public void UndistortInvertsDistortApproximately()
        {
            var p = LensProfile.CreateDefaultCardboard();
            for (float r = 0.05f; r <= 1f; r += 0.05f)
            {
                float d = p.Distort(r);
                float inv = p.Undistort(d);
                Assert.AreEqual(r, inv, 0.01f, $"Undistort(Distort(r)) failed for r={r}");
            }
        }

        [Test]
        public void Parse_InvalidUri_ReturnsFalse()
        {
            Assert.IsFalse(CardboardProfileQR.TryParse("not a uri", out _));
            Assert.IsFalse(CardboardProfileQR.TryParse("https://example.com", out _));
        }
    }
}
