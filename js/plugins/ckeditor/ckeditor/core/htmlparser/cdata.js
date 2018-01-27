

 'use strict';

( function() {

	
	CKEDITOR.htmlParser.cdata = function( value ) {
		
		this.value = value;
	};

	CKEDITOR.htmlParser.cdata.prototype = CKEDITOR.tools.extend( new CKEDITOR.htmlParser.node(), {
		
		type: CKEDITOR.NODE_TEXT,

		filter: function() {},

		
		writeHtml: function( writer ) {
			writer.write( this.value );
		}
	} );
} )();
