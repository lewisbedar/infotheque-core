<?php

namespace MediaWiki\Extension\InfothequeCore\Schema;

/**
 * One field of a form, mapped to one wikitext template parameter.
 */
class FieldDefinition {

	/**
	 * @param string $key Template parameter name, without the row number
	 *   (e.g. "edition" for edition1/edition2/...).
	 * @param FieldWidget $widget
	 * @param string $labelMsg
	 * @param string|null $helpMsg
	 * @param bool $required
	 * @param string[] $suggestedValues Offered in a combobox; free text stays allowed.
	 * @param string|null $example Shown as placeholder text.
	 * @param string|null $wikitextWrap sprintf template (one %s) the submitted
	 *   value is wrapped into before being written into the generated
	 *   wikitext, e.g. turning a bare file name into "[[Fichier:%s|centré]]".
	 *   Left null when the value is used verbatim.
	 */
	public function __construct(
		public readonly string $key,
		public readonly FieldWidget $widget,
		public readonly string $labelMsg,
		public readonly ?string $helpMsg = null,
		public readonly bool $required = false,
		public readonly array $suggestedValues = [],
		public readonly ?string $example = null,
		public readonly ?string $wikitextWrap = null
	) {
	}

	/**
	 * Renders a submitted value into the fragment that goes after "=" in
	 * the generated {{Modèle:...|param=...}} call.
	 */
	public function toWikitext( string $value ): string {
		if ( $this->wikitextWrap === null || $value === '' ) {
			return $value;
		}
		return sprintf( $this->wikitextWrap, $value );
	}
}
