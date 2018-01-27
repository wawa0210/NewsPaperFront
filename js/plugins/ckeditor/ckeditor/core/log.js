





'use strict';


CKEDITOR.VERBOSITY_WARN = 1;


CKEDITOR.VERBOSITY_ERROR = 2;


CKEDITOR.verbosity = CKEDITOR.VERBOSITY_WARN | CKEDITOR.VERBOSITY_ERROR;


CKEDITOR.warn = function( errorCode, additionalData ) {
	if ( CKEDITOR.verbosity & CKEDITOR.VERBOSITY_WARN ) {
		CKEDITOR.fire( 'log', { type: 'warn', errorCode: errorCode, additionalData: additionalData } );
	}
};


CKEDITOR.error = function( errorCode, additionalData ) {
	if ( CKEDITOR.verbosity & CKEDITOR.VERBOSITY_ERROR ) {
		CKEDITOR.fire( 'log', { type: 'error', errorCode: errorCode, additionalData: additionalData } );
	}
};


CKEDITOR.on( 'log', function( evt ) {
	if ( !window.console || !window.console.log ) {
		return;
	}

	var type = console[ evt.data.type ] ? evt.data.type : 'log',
		errorCode = evt.data.errorCode,
		additionalData = evt.data.additionalData,
		prefix = '[CKEDITOR] ',
		errorCodeLabel = 'Error code: ';

	if ( additionalData ) {
		console[ type ]( prefix + errorCodeLabel + errorCode + '.', additionalData );
	} else {
		console[ type ]( prefix + errorCodeLabel + errorCode + '.' );
	}

	console[ type ]( prefix + 'For more information about this error go to http://docs.ckeditor.com/#!/guide/dev_errors-section-' + errorCode );
}, null, null, 999 );
