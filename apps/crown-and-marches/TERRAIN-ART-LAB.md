# Terrain Art Laboratory

Research only. Existing campaign renderer, simulation, architecture and battles are untouched.

## Real elevation control
Source: https://registry.opendata.aws/terrain-tiles ; https://github.com/tilezen/joerd/blob/master/docs/attribution.md .
HGT N46E011, 48 km square centered 46.57 N, 11.57 E, local equirectangular resampling at 125 m. The original HGT SHA-256, size and source header are retained in the QA artifact. Real Z is expressed in km per cell with a declared 2.5x visual exaggeration. No simulated world is replaced. Vegetation and fertility channels in this DEM control are explicitly elevation proxies, not observed vegetation data.
Attribution: Terrain Tiles (Mapzen/Tilezen), AWS Open Data; Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers; SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey.

## Original resources
Universal Art Forge v2 owns Blender source, GLB, editable scene and separate baked contact sheet. The eight meshes are distinct landform cross-sections: ridge, summit, outcrop, scree, gorge, foothills, rock shelf, slope (left to right, first and second row).
The assets must be reviewed before any scene uses them. Export generation runs through the existing Blender Asset Forge workflow, not a duplicate workflow.
A and B are geometry studies, not releases. A moves material downhill with conservative thermal transfer and carried sediment; B follows coarse ridge and drainage separation constraints. Both freeze simulation node heights and protected water/coast samples. A quantitative comparison is retained in QA. Neither is approved by passing tests.
