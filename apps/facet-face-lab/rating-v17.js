// FACET v1.7 point estimate: configuration only; legacy model affects uncertainty only.
const __facetV17CombinedWithLegacy = combineProtocolAssessments;
combineProtocolAssessments = function combineProtocolAssessmentsConfigurationOnly(values) {
  const result = __facetV17CombinedWithLegacy(values);
  const advanced = result.advanced;
  if (!advanced) return result;

  const legacyBase = typeof __facetV17BaseCombine === 'function' ? __facetV17BaseCombine(values) : result;
  const legacyRating = Number(legacyBase.rating) || 3;
  const configurationRating = 1 + advanced.configurationScore / 25;
  const evidenceFactor = clamp((advanced.confidence * .58 + advanced.landmarkStability * .42) / 100, .55, 1);
  const rating = clamp(3 + (configurationRating - 3) * evidenceFactor, 1.15, 4.75);
  const disagreement = Math.abs(configurationRating - legacyRating);
  const halfWidth = clamp(
    Math.max(
      legacyBase.halfWidth || .7,
      .60 + disagreement * .26 + (100 - advanced.confidence) * .0045 + (100 - advanced.landmarkStability) * .0025
    ),
    .58,
    1.40
  );

  return {
    ...result,
    rating,
    interval: [clamp(rating - halfWidth, 1, 5), clamp(rating + halfWidth, 1, 5)],
    halfWidth,
    model: {
      name: 'configural-interaction-v1.7',
      pointEstimate: 'configuration-only',
      legacyWeight: 0,
      configurationWeight: 1,
      dimensions: advanced.descriptors.length,
      relations: advanced.relations.length
    }
  };
};
