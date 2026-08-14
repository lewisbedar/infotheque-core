<?php

namespace MediaWiki\Extension\InfothequeCore\Schema;

/**
 * One field of a form, mapped to one wikitext template parameter (unless
 * $mergeIntoKey redirects it into another field's parameter instead).
 */
class FieldDefinition {

	/**
	 * @param string $key Template parameter name, without the row number
	 *   (e.g. "edition" for edition1/edition2/...). Ignored as an output
	 *   key when $mergeIntoKey is set.
	 * @param FieldWidget $widget
	 * @param string $labelMsg
	 * @param string|null $helpMsg
	 * @param bool $required
	 * @param string[] $suggestedValues Combobox: offered as autocomplete,
	 *   free text stays allowed. MultiSelect: the checkbox options (each
	 *   value is used verbatim, joined with ", " when several are picked).
	 * @param string|null $example Shown as placeholder text.
	 * @param string|null $wikitextWrap sprintf template (one %s) the submitted
	 *   value is wrapped into before being written into the generated
	 *   wikitext, e.g. turning a bare file name into "[[Fichier:%s|centré]]".
	 *   Left null when the value is used verbatim.
	 * @param bool $rawWikitext When true, the value is assumed to already be
	 *   deliberate wikitext typed by the user and is used as-is. Otherwise a
	 *   bare "|" is escaped to "{{!}}", since it would otherwise be misread
	 *   as a new template parameter separator (matches the escaping done by
	 *   the existing "+ Ajouter un téléchargement" gadget).
	 * @param list<array{key:string,label:string,wikitext:string}> $options
	 *   Select only: closed choices. The submitted value is looked up by
	 *   "key"; a value matching no key is treated as already-raw custom
	 *   wikitext (the client reveals a free-text field for that case).
	 * @param string|null $mergeIntoKey When set, this field doesn't produce
	 *   its own "|key{n}=" line — its (transformed) value is appended into
	 *   the row's value for the field keyed $mergeIntoKey instead (e.g. a
	 *   serial-number field folded into "description").
	 * @param string|null $lineWrap sprintf template (one %s) applied to each
	 *   non-empty line of the value, concatenated with no separator — used
	 *   with $mergeIntoKey (e.g. wrapping each serial number in
	 *   `<div class="ith-dl-serialbox">...</div>`, mirroring the existing
	 *   gadget's convention). Also used in reverse by ExistingBlockParser to
	 *   pull merged content back out for pre-filling.
	 * @param bool $allowUpload File widget only: shows a "Téléverser..."
	 *   button opening MediaWiki's own upload dialog next to the
	 *   search-existing-file input. Off by default — deliberately not set
	 *   for Pilotes' "fichier" field, since uploading drivers to the wiki
	 *   isn't the expected path there (see its placeholder/help text).
	 * @param bool $multiple File widget only: a repeatable list of file
	 *   entries (JSON-encoded array submitted from the client) instead of
	 *   a single one. Generates a single "[[Fichier:%s]]" ($wikitextWrap)
	 *   when there's exactly one, or a "<gallery>" block when there are
	 *   several — Modèle:Téléchargements' "image" param already documents
	 *   accepting either ("Photo ou galerie illustrant cette édition").
	 */
	public function __construct(
		public readonly string $key,
		public readonly FieldWidget $widget,
		public readonly string $labelMsg,
		public readonly ?string $helpMsg = null,
		public readonly bool $required = false,
		public readonly array $suggestedValues = [],
		public readonly ?string $example = null,
		public readonly ?string $wikitextWrap = null,
		public readonly bool $rawWikitext = false,
		public readonly array $options = [],
		public readonly ?string $mergeIntoKey = null,
		public readonly ?string $lineWrap = null,
		public readonly bool $allowUpload = false,
		public readonly bool $multiple = false
	) {
	}

	/**
	 * Renders a submitted value into the fragment that goes after "=" in
	 * the generated {{Modèle:...|param=...}} call.
	 */
	public function toWikitext( string $value ): string {
		if ( $value === '' ) {
			return $value;
		}

		if ( $this->widget === FieldWidget::Links ) {
			return self::buildLinksWikitext( $value );
		}

		if ( $this->widget === FieldWidget::File && $this->multiple ) {
			return $this->buildGalleryWikitext( $value );
		}

		if ( $this->lineWrap !== null ) {
			$lines = array_filter(
				array_map( 'trim', preg_split( '/\r?\n/', $value ) ),
				static fn ( string $l ): bool => $l !== ''
			);
			return implode( '', array_map(
				fn ( string $l ): string => sprintf( $this->lineWrap, $l ),
				$lines
			) );
		}

		if ( $this->widget === FieldWidget::Select ) {
			foreach ( $this->options as $option ) {
				if ( $option['key'] === $value ) {
					return $option['wikitext'];
				}
			}
			// No match: the client's "autre" choice sends already-raw wikitext.
			return $value;
		}

		if ( $this->widget === FieldWidget::File ) {
			// Defensively strip a "Fichier:"/"File:" prefix — the wiki
			// convention (see Modèle:Pilotes) is to store the bare file name.
			$value = preg_replace( '/^(Fichier|File)\s*:\s*/iu', '', $value );
		} elseif ( !$this->rawWikitext ) {
			$value = str_replace( '|', '{{!}}', $value );
		}

		if ( $this->wikitextWrap === null ) {
			return $value;
		}
		return sprintf( $this->wikitextWrap, $value );
	}

	/**
	 * @param string $json JSON-encoded list of {"url":..., "label":...}.
	 * @return string A single "[url label]", a "* [url label]" bulleted
	 *   list if there are several, or "" if none had a URL.
	 */
	private static function buildLinksWikitext( string $json ): string {
		$links = json_decode( $json, true );
		if ( !is_array( $links ) ) {
			return '';
		}

		$formatted = [];
		foreach ( $links as $link ) {
			$url = trim( (string)( $link['url'] ?? '' ) );
			if ( $url === '' ) {
				continue;
			}
			$label = trim( (string)( $link['label'] ?? '' ) );
			if ( $label === '' ) {
				$label = 'Téléchargement';
			}
			// MediaWiki only renders [url text] as a link if the URL has a
			// scheme (http://, https://...); without one it shows the raw
			// brackets as plain text.
			if ( !preg_match( '/^[a-z][a-z0-9+.-]*:\/\//i', $url ) ) {
				$url = 'https://' . $url;
			}
			$formatted[] = '[' . $url . ' ' . $label . ']';
		}

		if ( $formatted === [] ) {
			return '';
		}
		if ( count( $formatted ) === 1 ) {
			return $formatted[0];
		}
		return implode( "\n", array_map( static fn ( string $f ): string => '* ' . $f, $formatted ) );
	}

	/**
	 * @param string $json JSON-encoded list of bare wiki file names.
	 * @return string "" if none, $wikitextWrap applied to the single name
	 *   if there's exactly one, or a "<gallery>" block if there are several.
	 */
	private function buildGalleryWikitext( string $json ): string {
		$names = json_decode( $json, true );
		if ( !is_array( $names ) ) {
			return '';
		}

		$names = array_values( array_filter(
			array_map( static fn ( $n ): string => trim( (string)$n ), $names ),
			static fn ( string $n ): bool => $n !== ''
		) );
		if ( $names === [] ) {
			return '';
		}
		if ( count( $names ) === 1 ) {
			return $this->wikitextWrap !== null ? sprintf( $this->wikitextWrap, $names[0] ) : $names[0];
		}

		$lines = array_map( static fn ( string $n ): string => 'Fichier:' . $n, $names );
		return "<gallery>\n" . implode( "\n", $lines ) . "\n</gallery>";
	}
}
