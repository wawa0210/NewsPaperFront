




CKEDITOR.ENTER_P = 1;


CKEDITOR.ENTER_BR = 2;


CKEDITOR.ENTER_DIV = 3;


CKEDITOR.config = {
	
	customConfig: 'config.js',

	
	autoUpdateElement: true,

	
	language: '',

	
	defaultLanguage: 'en',

	
	contentsLangDirection: '',

	
	enterMode: CKEDITOR.ENTER_P,

	
	forceEnterMode: false,

	
	shiftEnterMode: CKEDITOR.ENTER_BR,

	
	docType: '<!DOCTYPE html>',

	
	bodyId: '',

	
	bodyClass: '',

	
	fullPage: false,

	
	height: 200,

	
	contentsCss: CKEDITOR.getUrl( 'contents.css' ),

	
	plugins: '', // %REMOVE_LINE%

	
	extraPlugins: '',

	
	removePlugins: '',

	
	protectedSource: [],

	
	tabIndex: 0,

	
	width: '',

	
	baseFloatZIndex: 10000,

	
	blockedKeystrokes: [
		CKEDITOR.CTRL + 66, // Ctrl+B
		CKEDITOR.CTRL + 73, // Ctrl+I
		CKEDITOR.CTRL + 85 // Ctrl+U
	]
};





// PACKAGER_RENAME( CKEDITOR.config )
