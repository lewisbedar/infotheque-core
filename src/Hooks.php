<?php

namespace MediaWiki\Extension\InfothequeCore;

/**
 * Loose parameter typing on purpose: EditPage/OutputPage have moved
 * namespaces across MediaWiki versions (as Html/Linker/ParserOptions did
 * for this wiki's 1.46 install — see SpecialInfothequeCore), and this
 * handler only needs OutputPage::addModules()/addJsConfigVars(), so
 * depending on the exact class isn't worth the risk of guessing wrong.
 */
class Hooks {

	/**
	 * @param mixed $editor EditPage
	 * @param mixed $out OutputPage
	 */
	public static function onEditPageShowEditFormInitial( $editor, $out ): void {
		$out->addModules( 'ext.infothequeCore.editorButton' );
		$out->addJsConfigVars( 'ithcSchemas', SchemaExporter::exportAll() );
	}
}
