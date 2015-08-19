


$(document).ready(function(){
 
		//Homepage  add
		  $("#b01").click(function(){
	  		

	  // 		$.ajax({   
	  //  			 type: "POST",   
	  // 			  url: "some.php",   
	  //  			 data: "name=John&location=Boston",   
	  //  			 success: function(msg){   
	  //       	alert( "Data Saved: " + msg );   
	  //   	}   
			// }); 

	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#addhomeFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

		  }  );


		  //Homepage  edit
	  	 $("#b02").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#edithomeFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );


	  	  //User  add
	  	 $("#b03").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#adduserFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );


	  	   //User  edit
	  	 $("#b04").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#edituserFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );



	  	   	  //Type  add
	  	 $("#b05").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#addtypeFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );


	  	   //Type  edit
	  	 $("#b06").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#edittypeFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );






	  	   	  //Curriculum  add
	   $("#b07").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#addkcFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );


	  	   //Curriculum  edit
	  	$("#b08").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#editkcFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );



	  	 //Video  add
	   $("#b09").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#addvideoFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );


	  	 //Video  edit
	  	$("#b10").click(function(){
	  		
	  		$.ajax({
				cache: false,
				type: "POST",
				url:"ajax.php",	//把表单数据发送到ajax.php
				data:$('#editvideoFrm').serialize(),	//要发送的是ajaxFrm表单中的数据
				async: false,
					error: function(request) {
					alert("发送请求失败！");
				},
					success: function(data) {
					//$("#ajaxDiv").html(data);	//将返回的结果显示到ajaxDiv中
					alert("发送请求成功！");
					}
				});

	  }  );








	

});