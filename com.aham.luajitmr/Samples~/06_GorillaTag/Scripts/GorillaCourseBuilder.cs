using UnityEngine;

namespace LuaJITMR.Samples.GorillaTag
{
    /// <summary>
    /// Builds a simple procedural obstacle course (platforms + climbable walls) at startup so
    /// the Gorilla sample is playable without any prefabs.
    /// </summary>
    public class GorillaCourseBuilder : MonoBehaviour
    {
        public Material platformMat;
        public Material wallMat;
        public int wallCount = 8;
        public int platformCount = 12;

        private void Start()
        {
            if (platformMat == null) platformMat = CreateMat(new Color(0.2f, 0.5f, 0.3f));
            if (wallMat == null) wallMat = CreateMat(new Color(0.7f, 0.7f, 0.8f));

            // Ground
            CreatePrimitive(PrimitiveType.Cube, new Vector3(0f, -0.5f, 0f), new Vector3(30f, 1f, 30f), platformMat);

            // Climbable walls scattered around
            for (int i = 0; i < wallCount; i++)
            {
                float angle = (i / (float)wallCount) * Mathf.PI * 2f;
                float radius = 4f + Random.Range(0f, 3f);
                Vector3 pos = new Vector3(Mathf.Cos(angle) * radius, 1.5f, Mathf.Sin(angle) * radius);
                CreatePrimitive(PrimitiveType.Cube, pos, new Vector3(0.2f, 3f, 2f), wallMat);
            }

            // Floating platforms at different heights
            for (int i = 0; i < platformCount; i++)
            {
                Vector3 pos = new Vector3(
                    Random.Range(-8f, 8f),
                    Random.Range(0.5f, 3.5f),
                    Random.Range(-8f, 8f));
                float size = Random.Range(0.6f, 1.6f);
                CreatePrimitive(PrimitiveType.Cube, pos, new Vector3(size, 0.3f, size), platformMat);
            }
        }

        private static GameObject CreatePrimitive(PrimitiveType t, Vector3 pos, Vector3 scale, Material mat)
        {
            var go = GameObject.CreatePrimitive(t);
            go.transform.position = pos;
            go.transform.localScale = scale;
            if (mat != null) go.GetComponent<Renderer>().sharedMaterial = mat;
            return go;
        }

        private static Material CreateMat(Color c)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var m = new Material(shader) { color = c };
            return m;
        }
    }
}
