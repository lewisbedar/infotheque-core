<?php

namespace MediaWiki\Extension\InfothequeCore\Schema;

/**
 * The kinds of input widget a schema field can render as.
 */
enum FieldWidget {
	case Text;
	case Textarea;
	case Combobox;
	/** Autocompletes against existing File: pages; stores the bare file name. */
	case File;
	/** Closed set of choices, each mapped to its own wikitext value (FieldDefinition::$options). */
	case Select;
	/** Several choices at once, joined with ", " (FieldDefinition::$options). */
	case MultiSelect;
	/** Structured list of {url, label} pairs, rendered as [url label] or a bulleted list. */
	case Links;
}
