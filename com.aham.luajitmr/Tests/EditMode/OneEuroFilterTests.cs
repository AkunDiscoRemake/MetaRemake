using NUnit.Framework;
using UnityEngine;
using LuaJITMR.Tracking;

namespace LuaJITMR.Tests.EditMode
{
    public class OneEuroFilterTests
    {
        [Test]
        public void Filter_ConstantValue_ReturnsSameValue()
        {
            var f = new OneEuroFilter(1.0f, 0f, 1.0f);
            f.Reset(5f);
            float v = 5f;
            for (int i = 0; i < 100; i++) v = f.Filter(5f, 1f / 60f);
            Assert.AreEqual(5f, v, 0.001f);
        }

        [Test]
        public void Filter_OutputStaysWithinInputRange()
        {
            var f = new OneEuroFilter(1.0f, 0.007f, 1.0f);
            f.Reset(0f);
            for (int i = 0; i < 100; i++)
            {
                float input = Mathf.Sin(i * 0.1f);
                float output = f.Filter(input, 1f / 60f);
                Assert.That(output, Is.InRange(-1.1f, 1.1f));
            }
        }
    }
}
