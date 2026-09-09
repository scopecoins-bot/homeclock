import React from "react";
import { AppRegistry, View, Text } from "react-native";
const Test = () => (
  <View style={{flex:1, backgroundColor:"#ff0000", justifyContent:"center", alignItems:"center"}}>
    <Text style={{color:"#fff", fontSize:40}}>LAADKETEN-WERKT</Text>
  </View>
);
AppRegistry.registerComponent("HomeClock", () => Test);
